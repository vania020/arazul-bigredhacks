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
import { dedupeRoutes, generateDetours } from "@/services/detourService";
import { MapView } from "@/map/MapView";
import { RoutePolyline } from "@/map/RoutePolyline";
import { RouteEndpoints } from "@/map/RouteEndpoints";
import { ExposureLayer, type ExposureLayerStatus } from "@/map/ExposureLayer";
import { BrandHeader } from "./BrandHeader";
import { AraBird } from "./AraBird";
import { ExposureLegend } from "./ExposureLegend";
import { BottomSheet, type Snap } from "./BottomSheet";
import { RouteExplanationSheet } from "./RouteExplanationSheet";
import { MethodologyModal } from "./MethodologyModal";
import { SearchPage } from "@/pages/SearchPage";
import { NavigationPage } from "@/pages/NavigationPage";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { CandidateRoute, SearchRequest } from "@/types/route";

import { TimeOfDayComparison } from "./TimeOfDayComparison";
import { TripTools } from "./TripTools";
import { heatmapCopy } from "@/i18n/heatmap";
import { planningCopy } from "@/i18n/planning";
import { usePublishedActivity, PublishedActivity, ActivityLayer } from "@/activity";
import { MapPointPicker } from "@/map/MapPointPicker";
import type { LatLng } from "@/types/route";
import { CITIES } from "@/config/cities";
import { useCity } from "@/context/CityContext";

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
  const [snap, setSnap] = useState<Snap>("expanded");
  const [sheetH, setSheetH] = useState(0);
  const [nowHour, setNowHour] = useState(12);
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const [sharedLoaded, setSharedLoaded] = useState(false);
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
    setSnap("expanded");
    clearIncomingTrip();
  }, [incomingTrip, city.id, clearIncomingTrip]);
  const cancelPick = useCallback(() => {
    setPicking(null);
    setSnap("expanded");
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
      setSnap("expanded");
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

  // Fit map to routes
  useEffect(() => {
    if (!map || !rec) return;
    const b = new google.maps.LatLngBounds();
    rec.eligible.forEach((r) => r.path.forEach((p) => b.extend(p)));
    const padding = isMobile
      ? { top: 95, left: 48, right: 48, bottom: Math.round(window.innerHeight * 0.58) }
      : { top: 100, left: 90, right: 90, bottom: 90 };
    map.fitBounds(b, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, candidates]);

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
        const base = await computeRoutes({
          origin: req.origin,
          destination: req.destination,
          mode: req.mode,
          departure,
          alternatives: true,
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
        try {
          if (g && base.every((route) => scoreRoute(route, g, req.mode, h).coverage === "covered"))
            detours = await generateDetours(
              fastest,
              { origin: req.origin, destination: req.destination, mode: req.mode, departure },
              fastestC.durationSec + C.extraTime.max * 60,
            );
        } catch {
          detours = [];
        }
        if (cancelled()) return;
        const all = dedupeRoutes([...base, ...detours]);
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
    [mapState, isMobile, t, city],
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
  const onStart = (routeId: string) => {
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
  const timeComparison = (
    <TimeOfDayComparison
      route={selected ?? null}
      grid={grid}
      mode={rec ? searchMode : form.mode}
      hour={hour}
      timeZone={city.timeZone}
      onHourChange={onHour}
    />
  );
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

  const panel = (
    <>
      <div className="mb-5 space-y-2">
        <label htmlFor="city" className="block text-sm font-semibold">
          {t("city")}
        </label>
        <select
          id="city"
          value={city.id}
          onChange={(e) => setCity(e.target.value)}
          className="h-12 w-full rounded-xl border bg-card px-3 text-sm font-semibold"
        >
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="text-xs leading-relaxed text-text-secondary">
          <p>{t(city.datasetUrl ? "coverageArea" : "routingArea", { region: city.region })}</p>
          <p>{t("cityTime", { zone: city.timeZone })}</p>
          <button
            onClick={() => setMethOpen(true)}
            className="min-h-8 font-semibold text-primary underline"
          >
            {t("sourceDetails")}
          </button>
        </div>
        {dataState !== "ready" && (
          <p role="status" className="rounded-lg bg-muted p-3 text-xs leading-relaxed">
            {t(
              dataState === "loading"
                ? "dataLoading"
                : dataState === "error"
                  ? "dataLoadError"
                  : "dataUnavailable",
            )}
          </p>
        )}
        {grid?.meta.timeResolution === "all-day" && (
          <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed">{t("monthlyData")}</p>
        )}
        {grid && !grid.meta.modes.includes(rec ? searchMode : form.mode) && (
          <p role="status" className="rounded-lg bg-muted p-3 text-xs leading-relaxed">
            {t("unsupportedMode")}
          </p>
        )}
      </div>
      {sharedTripError && (
        <p role="alert" className="mb-4 rounded-lg border p-3 text-sm">
          {copy.invalid}
        </p>
      )}
      {sharedLoaded && (
        <p role="status" className="mb-4 rounded-lg bg-secondary p-3 text-sm">
          {copy.loaded}
        </p>
      )}
      {step !== null ? (
        <div className="space-y-3 py-6" aria-live="polite">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-3 rounded-xl p-3 text-sm transition-opacity ${i <= step ? "bg-secondary text-deep" : "opacity-40"}`}
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
          form={{
            ...(plannedRequest ?? form),
            mode: searchMode,
            departureHour: form.departureHour,
          }}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStart={onStart}
          onWhy={() => setWhyOpen(true)}
          onBack={() => {
            setCandidates(null);
            setAra(t("araHome"));
            if (isMobile) setSnap("expanded");
          }}
          onMode={onMode}
          onHour={onHour}
          extra={extra}
          setExtra={setExtra}
          feedback={feedback}
          timeComparison={timeComparison}
          tripTools={tripTools}
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
          timeComparison={timeComparison}
          onPick={(kind) => {
            setPicking(kind);
            setSnap("collapsed");
            setAra(null);
          }}
        />
      )}
      <div className="mt-5">
        <PublishedActivity
          state={activity}
          enabled={activityEnabled}
          onToggle={() => setActivityEnabled((v) => !v)}
          language={lang}
        />
      </div>
      {error && step === null && (
        <div role="alert" className="mt-4 rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold text-deep">{error.msg}</p>
          {error.dev && (
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{error.dev}</p>
          )}
          {error.dev && (
            <button
              onClick={() => runSearch(form)}
              className="mt-3 h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
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
          route={selected?.path}
          scope={rec ? layer : "city"}
          onStatus={setHeatmapStatus}
        />
      )}
      {map &&
        rec &&
        rec.eligible.map((r) => (
          <RoutePolyline
            key={r.id}
            map={map}
            path={r.path}
            selected={selected?.id === r.id}
            onClick={() => setSelectedId(r.id)}
          />
        ))}
      {map && routeStart && routeEnd && (
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
      {map && picking && (
        <MapPointPicker map={map} kind={picking} onPick={pickPoint} onCancel={cancelPick} />
      )}
      {mapState === "ready" && !picking && (
        <div
          className={`absolute left-3 right-16 top-3 z-10 flex flex-col items-start gap-2 ${isMobile ? "" : "max-w-sm"}`}
        >
          <div
            role="radiogroup"
            aria-label={t("layerToggle")}
            className="glass flex rounded-full border p-1 shadow-soft"
          >
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
        </div>
      )}
    </div>
  );

  return (
    <main className="fixed inset-0 flex">
      {isMobile ? (
        <>
          {mapArea}
          <BottomSheet snap={snap} onSnap={setSnap} onHeight={setSheetH}>
            <div className="mb-4">
              <BrandHeader />
            </div>
            {panel}
          </BottomSheet>
          <AraBird
            message={ara}
            celebrate={celebrate}
            working={step !== null}
            className="absolute right-3 z-10 max-w-[min(90vw,300px)]"
            style={{ bottom: sheetH + 8 }}
          />
        </>
      ) : (
        <>
          <aside className="relative z-10 flex h-full w-[34%] min-w-[380px] max-w-[480px] flex-col border-r bg-card shadow-soft">
            <div className="p-6 pb-4">
              <BrandHeader />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-28">{panel}</div>
            <AraBird
              message={ara}
              celebrate={celebrate}
              working={step !== null}
              className="absolute bottom-4 right-4"
            />
          </aside>
          <div className="relative flex-1">{mapArea}</div>
        </>
      )}
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
