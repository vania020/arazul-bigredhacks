/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { NAVIGATION_CONFIG as N } from "@/config/navigationConfig";
import { createLocationMarker, type LocationMarkerHandle } from "@/map/LocationMarker";
import { fill, navigationCopy } from "@/i18n/navigation";
import type { Lang } from "@/i18n";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { LatLng, LocationValue, Recommendation, ScoredRoute } from "@/types/route";
import { pointAlong } from "./geometry";
import { buildNavRoute, type NavRoute } from "./navRoute";
import { describeFailure, planReroute, RerouteError, type RoutePreference } from "./reroute";
import { initialTracker, updateTracker, type Fix, type Progress } from "./tracker";
import { useGeolocationWatch, type GeoErrorKind } from "./useGeolocation";
import { nextVoicePrompt, speak, speechSupported, stopSpeech } from "./voice";
import { routeLanguage, speechLanguage, spokenDistance, type Units } from "./format";

export type NavStatus = "starting" | "navigating" | "rerouting" | "arrived" | "error";
export type GpsStatus = "waiting" | "good" | "weak" | "lost" | GeoErrorKind;

/** What the user chose on the planning screen; fixed for the whole navigation session. */
export interface NavTrip {
  route: ScoredRoute;
  rec: Recommendation;
  preference: RoutePreference;
  destination: LocationValue;
  mode: TravelMode;
  extraMin: number;
  /** Hour the planning recommendation was scored for; reroutes keep scoring for it. */
  hour: number;
}

export interface ActiveRoute {
  scored: ScoredRoute;
  /** Comparison context for this route (planning search, or the reroute that produced it). */
  rec: Recommendation;
  nav: NavRoute;
  version: number;
  /** Whether rec actually compared this route with other options (drives "Why this route?"). */
  comparable: boolean;
}

interface Options {
  map: google.maps.Map;
  trip: NavTrip;
  grid: RiskGrid | null;
  lang: Lang;
  units: Units;
  onRouteChange: (route: ScoredRoute) => void;
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1);

export function useNavigation({ map, trip, grid, lang, units, onRouteChange }: Options) {
  const copy = navigationCopy[lang];
  const mode = trip.mode;
  const [active, setActive] = useState<ActiveRoute>(() => ({
    scored: trip.route,
    rec: trip.rec,
    nav: buildNavRoute(trip.route, navigationCopy[lang].follow),
    version: 0,
    comparable: trip.rec.eligible.length > 1,
  }));
  const [status, setStatus] = useState<NavStatus>("starting");
  const [gps, setGps] = useState<GpsStatus>("waiting");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [following, setFollowing] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [rerouteBlocked, setRerouteBlocked] = useState(false);
  // Persistent until back on route or a successful reroute: the preference could not be kept.
  const [routeIssue, setRouteIssue] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [arrivedAt, setArrivedAt] = useState<number | null>(null);

  // Hot-path state lives in refs so GPS readings never re-render unrelated UI.
  const activeRef = useRef(active);
  const statusRef = useRef<NavStatus>("starting");
  const tracker = useRef(initialTracker());
  const marker = useRef<LocationMarkerHandle | null>(null);
  const followingRef = useRef(true);
  const lastGoodFix = useRef<Fix | null>(null);
  const lastFixAt = useRef<number | null>(null);
  const lastDisplay = useRef<LatLng | null>(null);
  const firstGood = useRef(false);
  const reroute = useRef({
    inFlight: false,
    lastAt: 0,
    cooldown: N.reroute.cooldownMs as number,
    count: 0,
    manualCount: 0,
  });
  const announced = useRef(new Set<string>());
  const mutedRef = useRef(false);
  const alive = useRef(true);
  const noticeTimer = useRef<number | undefined>(undefined);

  const setNavStatus = (s: NavStatus) => {
    statusRef.current = s;
    setStatus(s);
  };
  const say = (text: string) => {
    if (!mutedRef.current) speak(text, speechLanguage(lang));
  };
  const flash = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500);
  };
  const prefLabel =
    trip.preference === "recommended"
      ? copy.prefRecommended
      : trip.preference === "fastest"
        ? copy.prefFastest
        : copy.prefCustom;

  const moveCamera = (p: LatLng, alongM: number | null, nav: NavRoute) => {
    if (!followingRef.current) return;
    // Center between the user and a look-ahead point so the next stretch stays visible.
    const ahead = alongM !== null ? pointAlong(nav, alongM + N.camera.lookAheadM[mode]) : null;
    map.panTo(ahead ? { lat: (p.lat + ahead.lat) / 2, lng: (p.lng + ahead.lng) / 2 } : p);
  };

  const announce = (p: Progress, version: number) => {
    const instruction = p.primary === "arrive" ? copy.arrive : p.primary.instruction;
    const withDistance = () =>
      fill(copy.inDistance, {
        distance: spokenDistance(p.distanceToManeuverM, units, copy),
        instruction: lowerFirst(instruction),
      });
    const startKey = `${version}:start`;
    if (!announced.current.has(startKey)) {
      announced.current.add(startKey);
      const first = p.departing ? instruction : withDistance();
      say(`${version === 0 ? copy.started : copy.routeUpdated} ${first}`);
      return;
    }
    const prompt = nextVoicePrompt(p, N.voiceAtM[mode], announced.current, version);
    if (!prompt) return;
    announced.current.add(prompt.key);
    say(prompt.now ? instruction : withDistance());
  };

  const manualReady = () => {
    const r = reroute.current;
    return (
      !r.inFlight &&
      r.manualCount < N.reroute.manualMaxPerSession &&
      Date.now() - r.lastAt >= N.reroute.manualCooldownMs
    );
  };

  const runReroute = async (manual: boolean) => {
    const r = reroute.current;
    const fix = lastGoodFix.current;
    if (!fix || r.inFlight || statusRef.current === "arrived" || statusRef.current === "error")
      return;
    const now = Date.now();
    if (manual) {
      // Manual taps have their own spacing and allowance; they never skip in-flight protection.
      if (!manualReady()) {
        flash(copy.recalcWait);
        return;
      }
      r.manualCount++;
    } else {
      if (r.count >= N.reroute.maxPerSession) {
        setRerouteBlocked(true);
        return;
      }
      if (now - r.lastAt < r.cooldown) return;
      r.count++;
    }
    r.inFlight = true;
    r.lastAt = now;
    setRerouteBlocked(false);
    setNavStatus("rerouting");
    const prev = activeRef.current;
    try {
      const plan = await planReroute({
        from: { lat: fix.lat, lng: fix.lng },
        fromLabel: copy.you,
        destination: trip.destination,
        mode,
        preference: trip.preference,
        grid,
        hour: trip.hour,
        extraMin: trip.extraMin,
        language: routeLanguage(lang),
        previous: { path: prev.nav.path, ...(prev.scored.via ? { via: prev.scored.via } : {}) },
        resumeFromM: tracker.current.alongM,
      });
      if (!alive.current || statusRef.current !== "rerouting") return;
      const next: ActiveRoute = {
        scored: plan.route,
        rec: plan.rec,
        nav: buildNavRoute(plan.route, copy.follow),
        version: prev.version + 1,
        comparable: plan.basis === "compared",
      };
      activeRef.current = next;
      setActive(next);
      tracker.current = initialTracker();
      r.cooldown = N.reroute.cooldownMs;
      setRouteIssue(null);
      onRouteChange(plan.route);
      setNavStatus("navigating");
      flash(fill(copy.rerouted, { pref: prefLabel }));
      handleFix(fix, true);
    } catch (e) {
      if (!alive.current) return;
      // Simple message for the user; the underlying Google/routing failure for developers.
      console.warn("[ARAZUL navigation] Reroute failed", {
        code: e instanceof RerouteError ? e.code : "UNEXPECTED",
        preference: trip.preference,
        mode,
        requests: e instanceof RerouteError ? e.requests : undefined,
        failures: e instanceof RerouteError ? e.failures : [describeFailure(e)],
      });
      r.cooldown = Math.min(r.cooldown * 2, N.reroute.maxCooldownMs);
      if (statusRef.current === "rerouting") setNavStatus("navigating");
      if (e instanceof RerouteError && e.code === "NO_SAFE_ROUTE") setRouteIssue(copy.noSafeRoute);
      else flash(copy.rerouteFailed);
    } finally {
      r.inFlight = false;
    }
  };

  function handleFix(fix: Fix, replay = false) {
    if (statusRef.current === "arrived" || statusRef.current === "error") return;
    if (!replay) lastFixAt.current = Date.now();
    const { nav, version } = activeRef.current;
    const res = updateTracker(nav, tracker.current, fix, mode);
    tracker.current = res.state;
    if (res.quality === "good") lastGoodFix.current = fix;
    if (res.onRoute) setRouteIssue(null);
    setGps(res.quality === "good" ? "good" : "weak");
    marker.current?.update(res.displayPoint, res.headingDeg, fix.accuracyM, res.quality !== "good");
    lastDisplay.current = res.displayPoint;
    if (statusRef.current === "starting") {
      setNavStatus("navigating");
      if (followingRef.current) map.setZoom(N.camera.zoom[mode]);
    }
    moveCamera(res.displayPoint, res.onRoute ? res.state.alongM : null, nav);
    if (res.progress) {
      setProgress(res.progress);
      announce(res.progress, version);
    }
    if (res.arrived) {
      setNavStatus("arrived");
      setArrivedAt(Date.now());
      say(copy.arrivedSpeech);
      return;
    }
    if (!firstGood.current && res.quality === "good") {
      firstGood.current = true;
      // Starting away from the planned origin: plan from here with the same preference.
      if (res.lateralM !== null && res.lateralM > N.startJoinM[mode]) {
        void runReroute(false);
        return;
      }
    }
    if (res.offRoute && statusRef.current === "navigating") void runReroute(false);
  }

  const handleError = (kind: GeoErrorKind) => {
    if (kind === "denied" || kind === "unsupported" || kind === "insecure") {
      setNavStatus("error");
      setGps(kind);
    } else if (kind === "timeout") setGps(lastFixAt.current ? "lost" : "waiting");
    else setGps("unavailable");
  };

  const watching = status !== "arrived" && status !== "error";
  useGeolocationWatch(watching, attempt, handleFix, handleError);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(noticeTimer.current);
      stopSpeech();
    };
  }, []);

  // Marker, initial framing, map controls and manual-pan detection; all undone on exit.
  useEffect(() => {
    marker.current = createLocationMarker(map, navigationCopy[lang].you);
    const b = new google.maps.LatLngBounds();
    activeRef.current.nav.path.forEach((p) => b.extend(p));
    map.fitBounds(b, 80);
    map.setOptions({ zoomControl: false });
    const drag = map.addListener("dragstart", () => {
      followingRef.current = false;
      setFollowing(false);
    });
    return () => {
      drag.remove();
      map.setOptions({ zoomControl: true });
      marker.current?.remove();
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = statusRef.current;
      if (
        lastFixAt.current &&
        Date.now() - lastFixAt.current > N.signalLostMs &&
        (s === "navigating" || s === "rerouting")
      )
        setGps("lost");
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  // Keep the screen awake while navigating (where supported); browsers release it when hidden.
  useEffect(() => {
    if (!watching || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [watching]);

  return {
    copy,
    status,
    gps,
    progress,
    active,
    following,
    notice,
    rerouteBlocked,
    routeIssue,
    recalcReady: manualReady(),
    startedAt,
    arrivedAt,
    prefLabel,
    voice: {
      supported: speechSupported(),
      muted,
      toggle: () => {
        mutedRef.current = !mutedRef.current;
        setMuted(mutedRef.current);
        if (mutedRef.current) stopSpeech();
      },
    },
    recenter: () => {
      followingRef.current = true;
      setFollowing(true);
      map.setZoom(N.camera.zoom[mode]);
      if (lastDisplay.current) map.panTo(lastDisplay.current);
    },
    retryGps: () => {
      setNavStatus("starting");
      setGps("waiting");
      setAttempt((a) => a + 1);
    },
    recalculate: () => void runReroute(true),
  };
}
