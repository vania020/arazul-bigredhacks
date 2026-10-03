/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { getApiKey } from "@/services/googleMaps";
import { loadRiskGrid } from "@/services/riskDataService";
import { computeRoutes, currentHourIn, describeGoogleError, nextOccurrenceOfHour } from "@/services/routingService";
import { recommend, scoreRoute } from "@/services/exposureService";
import { dedupeRoutes, generateDetours } from "@/services/detourService";
import { MapView } from "@/map/MapView";
import { RoutePolyline } from "@/map/RoutePolyline";
import { RouteEndpoints } from "@/map/RouteEndpoints";
import { ExposureLayer } from "@/map/ExposureLayer";
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

type MapState = "loading" | "ready" | "missing" | "error";
const cache = new Map<string, CandidateRoute[]>();

export function AppShell() {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [form, setForm] = useState<SearchRequest>({ origin: { label: "" }, destination: { label: "" }, mode: "driving", departureHour: null });
  const [extra, setExtra] = useState<number>(C.extraTime.default);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapErr, setMapErr] = useState<string | null>(null);
  const [grid, setGrid] = useState<RiskGrid | null>(null);
  const [candidates, setCandidates] = useState<CandidateRoute[] | null>(null);
  const [searchMode, setSearchMode] = useState<TravelMode>("driving");
  const [step, setStep] = useState<number | null>(null);
  const [error, setError] = useState<{ msg: string; dev?: string } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [methOpen, setMethOpen] = useState(false);
  const [layer, setLayer] = useState<"off" | "route" | "city">("off");
  const [zoomOk, setZoomOk] = useState(true);
  const [ara, setAra] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>("expanded");
  const [sheetH, setSheetH] = useState(0);
  const [nowHour, setNowHour] = useState(12);

  useEffect(() => {
    setNowHour(currentHourIn(C.timeZone));
    loadRiskGrid().then(setGrid);
    if (!getApiKey()) setMapState("missing");
    setAra(t("araHome"));
    const onAuth = () => { setMapState("error"); setMapErr("RefererNotAllowedMapError / InvalidKeyMapError (gm_authFailure)"); };
    window.addEventListener("arazul-maps-auth-failure", onAuth);
    return () => window.removeEventListener("arazul-maps-auth-failure", onAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hour = form.departureHour ?? nowHour;

  const rec = useMemo(
    () => (candidates && grid ? recommend(candidates, grid, searchMode, hour, extra) : null),
    [candidates, grid, searchMode, hour, extra],
  );

  // Ara + selection on recommendation changes
  const prevRecId = useRef<string | null>(null);
  const reason = useRef<"search" | "time" | "mode" | null>(null);
  useEffect(() => {
    if (!rec) { prevRecId.current = null; return; }
    setSelectedId(rec.recommended.id);
    const changed = prevRecId.current !== rec.recommended.id;
    const why = reason.current;
    reason.current = null;
    // Ara speaks only when a recommendation is generated (or genuinely changes).
    if (why === "search" || why === "mode" || (why === "time" && changed && prevRecId.current)) {
      if (why === "search" && rec.reason === "improved") setCelebrate((c) => c + 1);
      setAra(rec.reason === "improved" ? t("araResult", { min: rec.extraMin, pct: Math.round(rec.improvement * 100) }) : t("araFastest"));
    }
    prevRecId.current = rec.recommended.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  // Fit map to routes
  useEffect(() => {
    if (!map || !rec) return;
    const b = new google.maps.LatLngBounds();
    rec.eligible.forEach((r) => r.path.forEach((p) => b.extend(p)));
    const padding = isMobile ? { top: 95, left: 48, right: 48, bottom: Math.round(window.innerHeight * 0.58) } : { top: 100, left: 90, right: 90, bottom: 90 };
    map.fitBounds(b, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, candidates]);

  const runSearch = useCallback(async (req: SearchRequest, why: "search" | "mode" = "search") => {
    if (!req.origin.label.trim() || !req.destination.label.trim()) { setError({ msg: t("needBoth") }); return; }
    if (mapState === "missing") { setError({ msg: t("mapsMissing") }); return; }
    setError(null);
    const departure = req.mode === "driving" && req.departureHour !== null ? nextOccurrenceOfHour(req.departureHour, C.timeZone) : null;
    const key = JSON.stringify([req.origin.latLng ?? req.origin.label, req.destination.latLng ?? req.destination.label, req.mode, req.departureHour]);
    const finish = (list: CandidateRoute[]) => {
      reason.current = why;
      setSearchMode(req.mode); setCandidates(list); setStep(null);
      if (isMobile) setSnap("half");
    };
    if (cache.has(key)) { finish(cache.get(key)!); return; }
    try {
      setStep(0); setAra(null);
      const base = await computeRoutes({ origin: req.origin, destination: req.destination, mode: req.mode, departure, alternatives: true });
      if (!base.length) throw new Error("ZERO_RESULTS");
      setStep(1);
      const g = await loadRiskGrid();
      const fastestC = base.reduce((a, b) => (b.durationSec < a.durationSec ? b : a));
      const h = req.departureHour ?? currentHourIn(C.timeZone);
      const fastest = scoreRoute(fastestC, g, req.mode, h);
      setStep(2);
      let detours: CandidateRoute[] = [];
      try {
        detours = await generateDetours(fastest, { origin: req.origin, destination: req.destination, mode: req.mode, departure }, fastestC.durationSec + C.extraTime.max * 60);
      } catch { detours = []; }
      const all = dedupeRoutes([...base, ...detours]);
      cache.set(key, all);
      setAra(null);
      finish(all);
    } catch (e) {
      setStep(null);
      setError({ msg: t("routeError"), dev: describeGoogleError(e) });
      setAra(t("araNoAlt"));
    }
  }, [mapState, isMobile, t]);

  const onDemo = () => setForm({ origin: { label: "Av. Paulista, 1578, São Paulo" }, destination: { label: "Praça da Sé, São Paulo" }, mode: "driving", departureHour: 22 });
  // Extra-time slider: setExtra is defined in state; it re-scores locally via useMemo.

  const onHour = (h: number | null) => {
    setForm((f) => ({ ...f, departureHour: h }));
    if (candidates) {
      reason.current = "time";
      const b = C.bucketForHour(h ?? nowHour);
      setFeedback(t("updatedFor", { bucket: t(`bucket${b}` as "bucket0") }));
      setTimeout(() => setFeedback(null), 3500);
    }
  };
  const onMode = (m: TravelMode) => {
    const next = { ...form, mode: m };
    setForm(next);
    if (candidates) runSearch(next, "mode");
  };
  const onStart = () => {
    const r = rec?.eligible.find((x) => x.id === selectedId) ?? rec?.recommended;
    if (!r) return;
    const enc = (l: SearchRequest["origin"]) => encodeURIComponent(l.latLng ? `${l.latLng.lat},${l.latLng.lng}` : l.label);
    const via = r.via?.length ? `&waypoints=${encodeURIComponent(r.via.map((v) => `${v.lat},${v.lng}`).join("|"))}` : "";
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${enc(form.origin)}&destination=${enc(form.destination)}&travelmode=${searchMode}${via}`, "_blank", "noopener");
  };

  const steps = [t("stepFinding"), t("stepComparing"), t("stepDetours")];

  const panel = (
    <>
      {step !== null ? (
        <div className="space-y-3 py-6" aria-live="polite">
          {steps.map((s, i) => (
            <div key={s} className={`flex items-center gap-3 rounded-xl p-3 text-sm transition-opacity ${i <= step ? "bg-secondary text-deep" : "opacity-40"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${i < step ? "bg-primary" : i === step ? "animate-pulse bg-sky" : "bg-border"}`} />
              {s}
            </div>
          ))}
        </div>
      ) : rec ? (
        <NavigationPage rec={rec} form={form} selectedId={selectedId} onSelect={setSelectedId} onStart={onStart}
          onWhy={() => setWhyOpen(true)} onBack={() => { setCandidates(null); setAra(t("araHome")); if (isMobile) setSnap("expanded"); }}
          onMode={onMode} onHour={onHour} extra={extra} setExtra={setExtra} feedback={feedback} />
      ) : (
        <SearchPage form={form} setForm={setForm} extra={extra} setExtra={setExtra} mapsReady={mapState === "ready"}
          onSubmit={() => runSearch(form)} onDemo={onDemo} error={null} />
      )}
      {error && step === null && (
        <div role="alert" className="mt-4 rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold text-deep">{error.msg}</p>
          {error.dev && <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{error.dev}</p>}
          {error.dev && <button onClick={() => runSearch(form)} className="mt-3 h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">{t("retry")}</button>}
        </div>
      )}
      {grid?.isDemo && <p className="mt-4 inline-block rounded-full bg-exp-3/40 px-3 py-1 text-xs font-semibold text-navy">{t("demoBadge")}</p>}
    </>
  );

  const selected = rec?.eligible.find((r) => r.id === selectedId) ?? rec?.recommended;
  const routeStart = selected?.path[0];
  const routeEnd = selected?.path.at(-1);
  const layers = [["off", t("exposureOff")], ["route", t("routeExposure")], ["city", t("cityExposure")]] as const;

  const mapArea = (
    <div className="relative h-full w-full overflow-hidden bg-sky-soft">
      {mapState !== "missing" && (
        <MapView onReady={(m) => { setMap(m); setMapState("ready"); }} onError={(e) => { if (e === "MISSING_KEY") { setMapState("missing"); return; } setMapState("error"); setMapErr(e); }} />
      )}
      {(mapState === "missing" || mapState === "error") && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="max-w-sm rounded-3xl border bg-card p-6 text-center shadow-soft">
            <p className="font-display text-lg font-extrabold text-deep">{mapState === "missing" ? t("mapsMissing") : t("mapsError")}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {mapState === "missing" ? "Add VITE_GOOGLE_MAPS_API_KEY to enable live maps and routing." : mapErr}
            </p>
          </div>
        </div>
      )}
      {map && grid && layer !== "off" && <ExposureLayer map={map} grid={grid} mode={rec ? searchMode : form.mode} hour={hour} route={selected?.path} scope={rec ? layer : "city"} onZoomOk={setZoomOk} />}
      {map && rec && rec.eligible.map((r) => (
        <RoutePolyline key={r.id} map={map} path={r.path} selected={selected?.id === r.id} onClick={() => setSelectedId(r.id)} />
      ))}
      {map && routeStart && routeEnd && <RouteEndpoints map={map} start={routeStart} end={routeEnd} startLabel={t("startLabel")} endLabel={t("endLabel")} startAddress={form.origin.label} endAddress={form.destination.label} />}
      {mapState === "ready" && (
        <div className={`absolute left-3 right-16 top-3 z-10 flex flex-col items-start gap-2 ${isMobile ? "" : "max-w-sm"}`}>
          <div role="radiogroup" aria-label={t("layerToggle")} className="glass flex rounded-full border p-1 shadow-soft">
            {layers.filter(([k]) => rec || k !== "route").map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={layer === k} onClick={() => setLayer(k)}
                className={`h-9 rounded-full px-3 text-xs font-semibold transition-colors ${layer === k ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-foreground"}`}>
                {k === "off" ? label : rec ? label : t("layerToggle")}
              </button>
            ))}
          </div>
          {layer !== "off" && !zoomOk && <p className="glass rounded-full border px-3 py-1.5 text-xs text-text-secondary">{t("zoomHint")}</p>}
          {layer !== "off" && zoomOk && <ExposureLegend />}
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
            <div className="mb-4"><BrandHeader /></div>
            {panel}
          </BottomSheet>
          <AraBird message={ara} celebrate={celebrate} working={step !== null} className="absolute right-3 z-10 max-w-[min(90vw,300px)]" style={{ bottom: sheetH + 8 }} />
        </>
      ) : (
        <>
          <aside className="relative z-10 flex h-full w-[34%] min-w-[380px] max-w-[480px] flex-col border-r bg-card shadow-soft">
            <div className="p-6 pb-4"><BrandHeader /></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-28">{panel}</div>
            <AraBird message={ara} celebrate={celebrate} working={step !== null} className="absolute bottom-4 right-4" />
          </aside>
          <div className="relative flex-1">{mapArea}</div>
        </>
      )}
      {rec && <RouteExplanationSheet open={whyOpen} onClose={() => setWhyOpen(false)} rec={rec} budget={extra} onMethodology={() => { setWhyOpen(false); setMethOpen(true); }} />}
      <MethodologyModal open={methOpen} onClose={() => setMethOpen(false)} grid={grid} />
    </main>
  );
}
