/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { getApiKey } from "@/services/googleMaps";
import { loadRiskGrid } from "@/services/riskDataService";
import {
  computeRoutes,
  currentHourIn,
  describeGoogleError,
  nextOccurrenceOfHour,
} from "@/services/routingService";
import { recommend, scoreRoute, hasExposureComparison } from "@/services/exposureService";
import { dedupeRoutes, generateDetours, type DetourTrace } from "@/services/detourService";
import {
  createDetourTrace,
  explainRecommendation,
  logRouteDebug,
  routeDebugEnabled,
} from "@/services/routeDebug";
import { MapView } from "@/map/MapView";
import { RoutePolyline } from "@/map/RoutePolyline";
import { RouteEndpoints } from "@/map/RouteEndpoints";
import { ExposureLayer, type ExposureLayerStatus } from "@/map/ExposureLayer";
import { BrandHeader } from "./BrandHeader";
import { CityPicker } from "./CityPicker";
import { AraBird } from "./AraBird";
import { ExposureLegend } from "./ExposureLegend";
import { BottomSheet, type Snap } from "./BottomSheet";
import { RouteExplanationSheet } from "./RouteExplanationSheet";
import { MethodologyModal } from "./MethodologyModal";
import { SearchPage, TripCard } from "@/pages/SearchPage";
import { TravelModeToggle } from "./TravelModeToggle";
import { NavigationPage, RouteSwitcher, TripHeader } from "@/pages/NavigationPage";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { CandidateRoute, SearchRequest } from "@/types/route";

import { LowerExposureOption } from "./LowerExposureOption";
import { outsideBudgetOptions, type OutsideBudgetOption } from "@/services/outsideBudget";
import { TripTools } from "./TripTools";
import { RoutePeek } from "./RouteSummary";
import { routeOptions } from "./routeFacts";
import { heatmapCopy } from "@/i18n/heatmap";
import { planningCopy } from "@/i18n/planning";
import { usePublishedActivity, PublishedActivity, ActivityLayer } from "@/activity";
import { MapPointPicker } from "@/map/MapPointPicker";
import type { LatLng, ScoredRoute } from "@/types/route";
import { useCity } from "@/context/CityContext";
import { NavigationSession } from "./navigation/NavigationSession";
import { NavigationErrorBoundary } from "./navigation/NavigationErrorBoundary";
import { navigationCopy } from "@/i18n/navigation";
import type { NavTrip } from "@/navigation/useNavigation";
import { routeLanguage, unitsForCountry } from "@/navigation/format";
import { primeSpeech } from "@/navigation/voice";

type MapState = "loading" | "ready" | "missing" | "error";
const cache = new Map<string, CandidateRoute[]>();

export function AppShell() {
  const { t, lang } = useI18n();
  const copy = planningCopy[lang];
  const heatmapText = heatmapCopy[lang];
  const {
    city,
    setCity,
    incomingTrip,
    clearIncomingTrip,
    sharedTripError,
    activityEnabled,
    setActivityEnabled,
  } = useCity();
  const activity = usePublishedActivity(city.id, activityEnabled);
  const active = useRef(true);
  const requestSequence = useRef(0);
  const [dataState, setDataState] = useState<"loading" | "ready" | "unavailable" | "error">(
    city.datasetUrl ? "loading" : "unavailable",
  );
  const isMobile = useIsMobile();
  const [form, setForm] = useState<SearchRequest>({
    origin: { label: "" },
    destination: { label: "" },
    mode: city.defaultMode,
    departureHour: null,
  });
  const [plannedRequest, setPlannedRequest] = useState<SearchRequest | null>(null);
  const [extra, setExtra] = useState<number>(C.extraTime.default);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapErr, setMapErr] = useState<string | null>(null);
  const [grid, setGrid] = useState<RiskGrid | null>(null);
  const [candidates, setCandidates] = useState<CandidateRoute[] | null>(null);
  const [searchMode, setSearchMode] = useState<TravelMode>(city.defaultMode);
  const [step, setStep] = useState<number | null>(null);
  const [error, setError] = useState<{ msg: string; dev?: string } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [methOpen, setMethOpen] = useState(false);
  const [layer, setLayer] = useState<"off" | "route" | "city">("off");
  const [heatmapStatus, setHeatmapStatus] = useState<ExposureLayerStatus>("ready");
  const [ara, setAra] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>("half");
  const [sheetH, setSheetH] = useState(0);
  const [nowHour, setNowHour] = useState(12);
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // Desktop navigation panel host (the side panel), so navigation keeps the map large.
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);
  const [sharedLoaded, setSharedLoaded] = useState(false);
  // In-app navigation: the Arazul route the user started, and the route currently followed
  // (differs from navTrip.route only after a preference-preserving reroute).
  const [navTrip, setNavTrip] = useState<NavTrip | null>(null);
  const [navRoute, setNavRoute] = useState<ScoredRoute | null>(null);
  useEffect(() => {
    if (!incomingTrip || incomingTrip.cityId !== city.id) return;
    const endpoint = (v: SearchRequest["origin"]) => ({
      ...v,
      label: v.label || `${v.latLng?.lat}, ${v.latLng?.lng}`,
    });
    // Loading a link only fills the form; routing waits for the user's submit.
    requestSequence.current++;
    setStep(null);
    setCandidates(null);
    setPlannedRequest(null);
    setError(null);
    setForm({
      origin: endpoint(incomingTrip.origin),
      destination: endpoint(incomingTrip.destination),
      mode: incomingTrip.mode,
      departureHour: incomingTrip.hour,
    });
    setExtra(incomingTrip.extraMinutes);
    setSharedLoaded(true);
    setPicking(null);
    setSnap("half");
    clearIncomingTrip();
  }, [incomingTrip, city.id, clearIncomingTrip]);
  const cancelPick = useCallback(() => {
    setPicking(null);
    setSnap("half");
  }, []);
  const pickPoint = useCallback(
    (point: LatLng) => {
      if (!picking) return;
      setForm((f) => ({
        ...f,
        [picking]: {
          label: `${copy.point} (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
          latLng: point,
        },
      }));
      setPicking(null);
      setSnap("half");
    },
    [picking, copy.point],
  );

  useEffect(() => {
    active.current = true;
    setNowHour(currentHourIn(city.timeZone));
    const clock = setInterval(() => setNowHour(currentHourIn(city.timeZone)), 60000);
    loadRiskGrid(city)
      .then((g) => {
        if (!active.current) return;
        setGrid(g);
        setDataState(g ? "ready" : "unavailable");
      })
      .catch(() => {
        if (active.current) setDataState("error");
      });
    if (!getApiKey()) setMapState("missing");
    setAra(t("araHome"));
    const onAuth = () => {
      setMapState("error");
      setMapErr("RefererNotAllowedMapError / InvalidKeyMapError (gm_authFailure)");
    };
    window.addEventListener("arazul-maps-auth-failure", onAuth);
    return () => {
      clearInterval(clock);
      active.current = false;
      requestSequence.current++;
      window.removeEventListener("arazul-maps-auth-failure", onAuth);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hour = form.departureHour ?? nowHour;

  const rec = useMemo(
    () => (candidates ? recommend(candidates, grid, searchMode, hour, extra) : null),
    [candidates, grid, searchMode, hour, extra],
  );

  // Lower-exposure routes Arazul already generated but that exceed the user's budget: shown as a
  // secondary option (never recommended). Cached candidates only, so no extra Google requests.
  const scoredCandidates = useMemo(
    () => (candidates ? candidates.map((c) => scoreRoute(c, grid, searchMode, hour)) : []),
    [candidates, grid, searchMode, hour],
  );
  const outside = useMemo(
    () => outsideBudgetOptions(rec, scoredCandidates, extra),
    [rec, scoredCandidates, extra],
  );
  // Choosing one is explicit: the budget rises to cover it (the UI shows the new allowance) and
  // the route is selected; it is then an ordinary eligible candidate for navigation.
  const chooseOutsideBudgetRoute = (option: OutsideBudgetOption) => {
    setExtra(Math.min(C.extraTime.max, Math.max(extra, option.allowMin)));
    setSelectedId(option.route.id);
  };

  // Development only: explain every candidate's outcome (console table + window.__arazulRouteDebug).
  const searchTrace = useRef<DetourTrace | null>(null);
  useEffect(() => {
    if (!routeDebugEnabled || !rec || !candidates) return;
    logRouteDebug(
      explainRecommendation({
        candidates,
        rec,
        grid,
        mode: searchMode,
        hour,
        extraMin: extra,
        trace: searchTrace.current,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  // Ara + selection on recommendation changes
  const prevRecId = useRef<string | null>(null);
  const reason = useRef<"search" | "time" | "mode" | null>(null);
  useEffect(() => {
    if (!rec) {
      prevRecId.current = null;
      return;
    }
    const resetSelection = reason.current === "search" || reason.current === "mode";
    // Keep the same selected geometry when exploring historical hours.
    setSelectedId((current) =>
      resetSelection || !rec.eligible.some((r) => r.id === current) ? rec.recommended.id : current,
    );
    const changed = prevRecId.current !== rec.recommended.id;
    const why = reason.current;
    reason.current = null;
    // Ara speaks only when a recommendation is generated (or genuinely changes).
    if (why === "search" || why === "mode" || (why === "time" && changed && prevRecId.current)) {
      if (why === "search" && rec.reason === "improved") setCelebrate((c) => c + 1);
      setAra(
        !hasExposureComparison(rec)
          ? t("noExposure")
          : rec.reason === "improved"
            ? t("araResult", { min: rec.extraMin, pct: Math.round(rec.improvement * 100) })
            : t("araFastest"),
      );
    }
    prevRecId.current = rec.recommended.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  useEffect(() => {
    if (map && !navTrip) map.setOptions({ zoomControl: !isMobile });
  }, [map, isMobile, navTrip]);

  // Fit map to routes
  const fitRoutes = () => {
    if (!map || !rec) return;
    const b = new google.maps.LatLngBounds();
    rec.eligible.forEach((r) => r.path.forEach((p) => b.extend(p)));
    const padding = isMobile
      ? // Clear the floating header/route chips above and the half-open sheet below.
        { top: 210, left: 40, right: 40, bottom: Math.round(window.innerHeight * 0.46) + 16 }
      : { top: 100, left: 90, right: 90, bottom: 90 };
    map.fitBounds(b, padding);
  };
  useEffect(() => {
    fitRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, candidates]);
  // Switching between the desktop and phone layouts re-frames the same routes (camera only).
  const layoutRef = useRef(isMobile);
  useEffect(() => {
    if (layoutRef.current === isMobile) return;
    layoutRef.current = isMobile;
    if (!navTrip) fitRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const runSearch = useCallback(
    async (req: SearchRequest, why: "search" | "mode" = "search") => {
      if (!req.origin.label.trim() || !req.destination.label.trim()) {
        setError({ msg: t("needBoth") });
        return;
      }
      if (mapState === "missing") {
        setError({ msg: t("mapsMissing") });
        return;
      }
      const requestId = ++requestSequence.current;
      const cancelled = () => !active.current || requestId !== requestSequence.current;
      setError(null);
      setSharedLoaded(false);
      setPicking(null);
      const departure =
        req.mode === "driving" && req.departureHour !== null
          ? nextOccurrenceOfHour(req.departureHour, city.timeZone)
          : null;
      const key = JSON.stringify([
        city.id,
        Math.floor(Date.now() / 300000),
        req.origin.latLng ?? req.origin.label,
        req.destination.latLng ?? req.destination.label,
        req.mode,
        req.departureHour,
        lang,
      ]);
      const finish = (list: CandidateRoute[]) => {
        if (cancelled()) return;
        setStep(null);
        reason.current = why;
        setSearchMode(req.mode);
        setPlannedRequest(req);
        if (req.departureHour === null) setNowHour(currentHourIn(city.timeZone));
        setCandidates(list);
        if (isMobile) setSnap("half");
      };
      if (cache.has(key)) {
        finish(cache.get(key)!);
        return;
      }
      try {
        setStep(0);
        setAra(null);
        const language = routeLanguage(lang);
        const base = await computeRoutes({
          origin: req.origin,
          destination: req.destination,
          mode: req.mode,
          departure,
          alternatives: true,
          language,
        });
        if (cancelled()) return;
        if (!base.length) throw new Error("ZERO_RESULTS");
        setStep(1);
        const g = await loadRiskGrid(city).catch(() => null);
        if (cancelled()) return;
        setGrid(g);
        setDataState(g ? "ready" : city.datasetUrl ? "error" : "unavailable");
        const fastestC = base.reduce((a, b) => (b.durationSec < a.durationSec ? b : a));
        const h = req.departureHour ?? currentHourIn(city.timeZone);
        const fastest = scoreRoute(fastestC, g, req.mode, h);
        setStep(2);
        let detours: CandidateRoute[] = [];
        const trace = routeDebugEnabled ? createDetourTrace() : undefined;
        try {
          if (g && base.every((route) => scoreRoute(route, g, req.mode, h).coverage === "covered"))
            detours = await generateDetours(
              fastest,
              {
                origin: req.origin,
                destination: req.destination,
                mode: req.mode,
                departure,
                language,
              },
              fastestC.durationSec + C.extraTime.max * 60,
              // Grid context enables region-aware bypasses around high-exposure regions.
              { grid: g, mode: req.mode, hour: h, known: base, ...(trace ? { trace } : {}) },
            );
        } catch {
          detours = [];
        }
        if (cancelled()) return;
        const all = dedupeRoutes([...base, ...detours], trace);
        searchTrace.current = trace ?? null;
        cache.set(key, all);
        setAra(null);
        finish(all);
      } catch (e) {
        if (cancelled()) return;
        setStep(null);
        setError({ msg: t("routeError"), dev: describeGoogleError(e) });
        setAra(t("araNoAlt"));
      }
    },
    [mapState, isMobile, t, lang, city],
  );

  const onDemo = () => setForm({ ...city.demo, mode: city.defaultMode, departureHour: 22 });
  // Extra-time slider: setExtra is defined in state; it re-scores locally via useMemo.

  const onHour = (h: number | null) => {
    setForm((f) => ({ ...f, departureHour: h }));
    if (candidates) {
      reason.current = "time";
      const b = C.bucketForHour(h ?? nowHour);
      setFeedback(
        !rec || !hasExposureComparison(rec)
          ? t("noExposure")
          : grid?.meta.timeResolution === "all-day"
            ? t("monthlyData")
            : t("updatedFor", { bucket: t(`bucket${b}` as "bucket0") }),
      );
      setTimeout(() => setFeedback(null), 3500);
    }
  };
  const onMode = (m: TravelMode) => {
    const next = { ...form, mode: m };
    setForm(next);
    if (candidates) runSearch(next, "mode");
  };
  // Navigates exactly the selected Arazul route; its kind becomes the reroute preference.
  const onStart = (routeId: string, kind: "recommended" | "fastest" | "alternative") => {
    const r = rec?.eligible.find((x) => x.id === routeId);
    if (!r || !rec || !plannedRequest || !map) return;
    primeSpeech(); // must run inside the click gesture for mobile Safari
    setNavRoute(r);
    setNavTrip({
      route: r,
      rec,
      preference: kind === "alternative" ? "custom" : kind,
      destination: plannedRequest.destination,
      mode: searchMode,
      extraMin: extra,
      hour, // the hour this recommendation was scored for
    });
    setWhyOpen(false);
    setPicking(null);
    setAra(null);
  };
  const onEndNavigation = () => {
    setNavTrip(null);
    setNavRoute(null);
    if (isMobile) setSnap("half");
    fitRoutes();
  };
  const onOpenExternal = (routeId: string) => {
    const r = rec?.eligible.find((x) => x.id === routeId);
    if (!r || !plannedRequest) return;
    const enc = (l: SearchRequest["origin"]) =>
      encodeURIComponent(l.latLng ? `${l.latLng.lat},${l.latLng.lng}` : l.label);
    const via = r.via?.length
      ? `&waypoints=${encodeURIComponent(r.via.map((v) => `${v.lat},${v.lng}`).join("|"))}`
      : "";
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${enc(plannedRequest.origin)}&destination=${enc(plannedRequest.destination)}&travelmode=${searchMode}${via}`,
      "_blank",
      "noopener",
    );
  };

  const steps = [t("stepFinding"), t("stepComparing"), t("stepDetours")];

  const selected = rec?.eligible.find((r) => r.id === selectedId) ?? rec?.recommended;
  const tripTools =
    rec && selected && plannedRequest ? (
      <TripTools
        trip={{
          version: 1,
          cityId: city.id,
          origin: plannedRequest.origin,
          destination: plannedRequest.destination,
          mode: searchMode,
          hour: form.departureHour,
          extraMinutes: extra,
        }}
        route={selected}
        grid={grid}
        comparisonAvailable={hasExposureComparison(rec)}
      />
    ) : null;

  const resultsForm: SearchRequest = {
    ...(plannedRequest ?? form),
    mode: searchMode,
    departureHour: form.departureHour,
  };
  const goBack = () => {
    setCandidates(null);
    setAra(t("araHome"));
    if (isMobile) setSnap("half");
  };
  const startPick = (kind: "origin" | "destination") => {
    setPicking(kind);
    setSnap("collapsed");
    setAra(null);
  };

  const cityPicker = (
    <div className="mb-4">
      <CityPicker
        city={city}
        onChange={setCity}
        onDetails={() => setMethOpen(true)}
        notes={[
          ...(dataState !== "ready"
            ? [
                {
                  text: t(
                    dataState === "loading"
                      ? "dataLoading"
                      : dataState === "error"
                        ? "dataLoadError"
                        : "dataUnavailable",
                  ),
                  status: true,
                },
              ]
            : []),
          ...(grid?.meta.timeResolution === "all-day" ? [{ text: t("monthlyData") }] : []),
          ...(grid && !grid.meta.modes.includes(rec ? searchMode : form.mode)
            ? [{ text: t("unsupportedMode"), status: true }]
            : []),
        ]}
      />
    </div>
  );

  const peekOption = rec && step === null ? routeOptions(rec, selectedId).current : null;
  const peek = rec && peekOption && (
    <RoutePeek
      route={peekOption.route}
      kind={peekOption.kind}
      fastest={rec.fastest}
      comparisonAvailable={hasExposureComparison(rec)}
      onStart={() => onStart(peekOption.route.id, peekOption.kind)}
    />
  );

  const panel = (
    <>
      {!(rec && step === null) && cityPicker}
      {sharedTripError && (
        <p role="alert" className="mb-4 rounded-2xl border bg-card p-3 text-sm">
          {copy.invalid}
        </p>
      )}
      {sharedLoaded && (
        <p role="status" className="mb-4 rounded-2xl bg-secondary p-3 text-sm">
          {copy.loaded}
        </p>
      )}
      {step !== null ? (
        <div className="space-y-2 py-4" aria-live="polite">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium transition-opacity ${i <= step ? "bg-card text-deep shadow-soft" : "opacity-40"}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${i < step ? "bg-primary" : i === step ? "animate-pulse bg-sky" : "bg-border"}`}
              />
              {s}
            </div>
          ))}
        </div>
      ) : rec ? (
        <NavigationPage
          rec={rec}
          form={resultsForm}
          layout={isMobile ? "sheet" : "panel"}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStart={onStart}
          onOpenExternal={onOpenExternal}
          onWhy={() => setWhyOpen(true)}
          onBack={goBack}
          onMode={onMode}
          onHour={onHour}
          extra={extra}
          setExtra={setExtra}
          feedback={feedback}
          tripTools={tripTools}
          onExpand={isMobile ? () => setSnap("expanded") : undefined}
          lowerExposure={
            outside.options.length ? (
              <LowerExposureOption
                options={outside.options}
                budget={extra}
                onUse={chooseOutsideBudgetRoute}
              />
            ) : null
          }
        />
      ) : (
        <SearchPage
          form={form}
          setForm={setForm}
          extra={extra}
          setExtra={setExtra}
          mapsReady={mapState === "ready"}
          onSubmit={() => runSearch(form)}
          onDemo={onDemo}
          error={null}
          onPick={startPick}
          layout={isMobile ? "sheet" : "panel"}
        />
      )}
      {rec && step === null && <div className="mt-4">{cityPicker}</div>}
      <div className="mt-4">
        <PublishedActivity
          state={activity}
          enabled={activityEnabled}
          onToggle={() => setActivityEnabled((v) => !v)}
          language={lang}
        />
      </div>
      {error && step === null && (
        <div role="alert" className="mt-4 rounded-2xl border bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold text-deep">{error.msg}</p>
          {error.dev && (
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{error.dev}</p>
          )}
          {error.dev && (
            <button
              onClick={() => runSearch(form)}
              className="mt-3 h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {t("retry")}
            </button>
          )}
        </div>
      )}
    </>
  );

  const routeStart = selected?.path[0] ?? form.origin.latLng;
  const routeEnd = selected?.path.at(-1) ?? form.destination.latLng;
  const layers = [
    ["off", t("exposureOff")],
    ["route", t("routeExposure")],
    ["city", t("cityExposure")],
  ] as const;

  const canShowLayer = !!grid && grid.meta.modes.includes(rec ? searchMode : form.mode);

  const legendVisible = canShowLayer && layer !== "off" && heatmapStatus === "ready";
  const layerControls = (
    <>
      <div
        role="radiogroup"
        aria-label={t("layerToggle")}
        className="glass flex items-center rounded-full border p-1 shadow-soft"
      >
        <svg
          viewBox="0 0 24 24"
          className="mx-2 h-4 w-4 shrink-0 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />
        </svg>
        {layers
          .filter(([k]) => rec || k !== "route")
          .map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={(canShowLayer ? layer : "off") === k}
              disabled={k !== "off" && !canShowLayer}
              onClick={() => setLayer(k)}
              className={`h-9 rounded-full px-3 disabled:opacity-40 text-xs font-semibold transition-colors ${(canShowLayer ? layer : "off") === k ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-foreground"}`}
            >
              {k === "off" ? label : rec ? label : t("layerToggle")}
            </button>
          ))}
      </div>
      {activity.source && (
        <button
          type="button"
          role="switch"
          aria-label={copy.activity}
          aria-checked={activityEnabled}
          onClick={() => setActivityEnabled((v) => !v)}
          className="glass min-h-11 rounded-full border px-4 text-xs font-semibold shadow-soft"
        >
          {copy.activity} · {activityEnabled ? copy.on : copy.off}
        </button>
      )}
      {!canShowLayer && (
        <p
          role="status"
          className="glass max-w-full rounded-xl border px-3 py-2 text-xs text-text-secondary"
        >
          {dataState === "loading"
            ? t("dataLoading")
            : dataState === "error"
              ? t("dataLoadError")
              : grid
                ? t("unsupportedMode")
                : heatmapText.unavailable}
        </p>
      )}
      {canShowLayer && layer !== "off" && heatmapStatus !== "ready" && (
        <div
          role="status"
          className="glass max-w-full rounded-xl border px-3 py-2 text-xs text-text-secondary"
        >
          <p>
            {heatmapStatus === "zoom-in"
              ? t("zoomHint")
              : heatmapStatus === "outside-coverage"
                ? heatmapText.outside
                : heatmapText.empty}
          </p>
          {heatmapStatus === "zoom-in" ? (
            <button
              type="button"
              className="min-h-9 font-semibold text-primary underline"
              onClick={() => map?.setZoom(C.layer.minZoom)}
            >
              {heatmapText.zoom}
            </button>
          ) : (
            <button
              type="button"
              className="min-h-9 font-semibold text-primary underline"
              onClick={() => {
                setLayer("city");
                map?.panTo(city.center);
                map?.setZoom(Math.max(city.zoom, C.layer.minZoom));
              }}
            >
              {heatmapText.coverage}
            </button>
          )}
        </div>
      )}
      {canShowLayer && layer !== "off" && heatmapStatus === "ready" && <ExposureLegend />}
    </>
  );

  const mapArea = (
    <div className="relative h-full w-full overflow-hidden bg-sky-soft">
      {mapState !== "missing" && (
        <MapView
          onReady={(m) => {
            setMap(m);
            setMapState("ready");
          }}
          onError={(e) => {
            if (e === "MISSING_KEY") {
              setMapState("missing");
              return;
            }
            setMapState("error");
            setMapErr(e);
          }}
        />
      )}
      {(mapState === "missing" || mapState === "error") && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="max-w-sm rounded-3xl border bg-card p-6 text-center shadow-soft">
            <p className="font-display text-lg font-extrabold text-deep">
              {mapState === "missing" ? t("mapsMissing") : t("mapsError")}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {mapState === "missing"
                ? "Add VITE_GOOGLE_MAPS_API_KEY to enable live maps and routing."
                : mapErr}
            </p>
          </div>
        </div>
      )}
      {map && activityEnabled && (
        <ActivityLayer map={map} feed={activity.feed} cityId={city.id} language={lang} />
      )}
      {map && grid && canShowLayer && layer !== "off" && (
        <ExposureLayer
          map={map}
          grid={grid}
          mode={rec ? searchMode : form.mode}
          hour={hour}
          route={navRoute?.path ?? selected?.path}
          scope={rec ? layer : "city"}
          onStatus={setHeatmapStatus}
        />
      )}
      {map && navTrip && (
        <NavigationErrorBoundary
          message={navigationCopy[lang].crashed}
          endLabel={navigationCopy[lang].end}
          onEnd={onEndNavigation}
        >
          <NavigationSession
            map={map}
            trip={navTrip}
            grid={grid}
            units={unitsForCountry(city.countryCode)}
            isMobile={isMobile}
            panelHost={isMobile ? null : navHost}
            onRouteChange={setNavRoute}
            exposureLayer={{
              available: canShowLayer,
              on: canShowLayer && layer !== "off",
              toggle: () => setLayer((l) => (l === "off" ? "route" : "off")),
            }}
            onEnd={onEndNavigation}
          />
        </NavigationErrorBoundary>
      )}
      {map &&
        rec &&
        !navTrip &&
        rec.eligible.map((r) => (
          <RoutePolyline
            key={r.id}
            map={map}
            path={r.path}
            selected={selected?.id === r.id}
            onClick={() => setSelectedId(r.id)}
          />
        ))}
      {map && routeStart && routeEnd && !navTrip && (
        <RouteEndpoints
          map={map}
          start={routeStart}
          end={routeEnd}
          startLabel={t("startLabel")}
          endLabel={t("endLabel")}
          startAddress={form.origin.label}
          endAddress={form.destination.label}
        />
      )}
      {isMobile && !navTrip && !picking && (
        <div className="absolute inset-x-3 top-3 z-20 flex flex-col gap-2">
          <div className="glass rounded-2xl border px-3 py-2 shadow-soft">
            <BrandHeader
              onHelp={() => setMethOpen(true)}
              helpLabel={t("sourceDetails")}
              actions={
                <button
                  type="button"
                  onClick={() => setLayersOpen((v) => !v)}
                  aria-expanded={layersOpen}
                  aria-label={t("layerToggle")}
                  title={t("layerToggle")}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border shadow-soft ${layersOpen || (canShowLayer && layer !== "off") ? "border-primary bg-primary text-primary-foreground" : "bg-card text-deep hover:bg-secondary"}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden
                  >
                    <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />
                  </svg>
                </button>
              }
            />
          </div>
          {rec && step === null ? (
            <>
              <TripHeader floating form={resultsForm} onBack={goBack} />
              <RouteSwitcher rec={rec} selectedId={selectedId} onSelect={setSelectedId} />
            </>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                runSearch(form);
              }}
            >
              <TripCard
                form={form}
                setForm={setForm}
                mapsReady={mapState === "ready"}
                onPick={startPick}
              />
              <TravelModeToggle value={form.mode} onChange={(mode) => setForm({ ...form, mode })} />
            </form>
          )}
          {legendVisible && !layersOpen && (
            <div className="flex justify-end">
              <ExposureLegend />
            </div>
          )}
        </div>
      )}
      {map && picking && (
        <MapPointPicker map={map} kind={picking} onPick={pickPoint} onCancel={cancelPick} />
      )}
      {mapState === "ready" && !picking && !navTrip && !isMobile && (
        <div className="absolute right-4 top-4 z-10 flex max-w-md flex-col items-end gap-2">
          {layerControls}
        </div>
      )}
      {mapState === "ready" && !picking && !navTrip && isMobile && layersOpen && (
        <div className="absolute inset-x-3 top-[76px] z-30 flex flex-col items-end gap-2">
          {layerControls}
        </div>
      )}
    </div>
  );

  return (
    <main className="fixed inset-0 flex flex-col">
      {!isMobile && (
        <div key="topbar" className="z-20 shrink-0 border-b bg-card px-5 py-2.5 shadow-soft">
          <BrandHeader
            tagline="inline"
            onHelp={() => setMethOpen(true)}
            helpLabel={t("sourceDetails")}
          />
        </div>
      )}
      <div key="body" className="relative flex min-h-0 flex-1">
        {!isMobile && (
          <aside
            key="aside"
            className="relative z-10 flex h-full w-[clamp(340px,28vw,420px)] shrink-0 flex-col border-r bg-background"
          >
            {navTrip ? (
              <div ref={setNavHost} className="min-h-0 flex-1 overflow-y-auto p-4" />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">{panel}</div>
            )}
            {!navTrip && (
              <AraBird
                message={ara}
                celebrate={celebrate}
                working={step !== null}
                className="shrink-0 border-t bg-background px-4 py-3"
              />
            )}
          </aside>
        )}
        <div key="map" className="relative min-w-0 flex-1">
          {mapArea}
        </div>
        {isMobile && !navTrip && (
          <BottomSheet
            key="sheet"
            snap={snap}
            onSnap={setSnap}
            onHeight={setSheetH}
            halfRatio={rec && step === null ? 0.46 : 0.4}
            peek={peek}
          >
            {panel}
          </BottomSheet>
        )}
        {isMobile && !navTrip && (
          <AraBird
            key="ara"
            message={ara}
            celebrate={celebrate}
            working={step !== null}
            className="absolute left-3 right-3 z-10 max-w-sm"
            style={{ bottom: sheetH + 8 }}
          />
        )}
      </div>
      {rec && (
        <RouteExplanationSheet
          open={whyOpen}
          onClose={() => setWhyOpen(false)}
          rec={rec}
          budget={extra}
          onMethodology={() => {
            setWhyOpen(false);
            setMethOpen(true);
          }}
        />
      )}
      <MethodologyModal open={methOpen} onClose={() => setMethOpen(false)} grid={grid} />
    </main>
  );
}
