import { EXPOSURE_CONFIG as C, EXPOSURE_SCALE } from "@/config/exposureConfig";
import { samplePath } from "./geo";
import { isPathInsideCoverage, type CoverageGeoJSON } from "./nycCoverage";
import type { RiskGrid, RiskCell, TravelMode } from "@/types/risk";
import type { CandidateRoute, Hotspot, LatLng, Recommendation, ScoredRoute } from "@/types/route";

export function cellKey(grid: RiskGrid, lat: number, lon: number) {
  const { originLat, originLon, cellSizeM } = grid.meta;
  const row = Math.floor(((lat - originLat) * 111320) / cellSizeM);
  const col = Math.floor(
    ((lon - originLon) *
      111320 *
      Math.cos(((grid.meta.projectionLatitude ?? originLat) * Math.PI) / 180)) /
      cellSizeM,
  );
  return `${row}_${col}`;
}

/** Severity/mode/recency/spread are already applied in the file; only time-blending happens here. */
export function blendedValue(cell: RiskCell | undefined, mode: TravelMode, hour: number) {
  if (!cell) return 0;
  const v = cell[mode] as [number, number, number, number];
  const avg = (v[0] + v[1] + v[2] + v[3]) / 4;
  return C.currentBucketWeight * v[C.bucketForHour(hour)]! + C.averageBucketWeight * avg;
}

export function scaleIndexFor(value: number) {
  return EXPOSURE_SCALE.findIndex((s) => value < s.max);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] ?? 0;
}

export function scoreRoute(
  route: CandidateRoute,
  grid: RiskGrid | null,
  mode: TravelMode,
  hour: number,
): ScoredRoute {
  const coverage = routeCoverage(route, grid, mode);
  if (coverage !== "covered" || !grid)
    return {
      ...route,
      coverage,
      exposure: 0,
      index: 0,
      hotspots: [],
      hotspotMeters: 0,
      contributors: {},
    };
  const samples = samplePath(route.path, C.sampleSpacingM);
  const vals: number[] = [];
  const contributors: Record<string, number> = {};
  let exposure = 0;
  for (const s of samples) {
    const cell = grid.cells[cellKey(grid, s.p.lat, s.p.lng)];
    const v = blendedValue(cell, mode, hour);
    vals.push(v);
    exposure += v * s.w;
    const top = cell?.top?.[mode]?.[0];
    if (top && v > 0) contributors[top] = (contributors[top] ?? 0) + s.w;
  }
  const thr: number = percentile(vals, C.hotspotPercentile);
  const hotspots: Hotspot[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start >= 0 && end - start + 1 >= C.hotspotMinSamples) {
      let len = 0,
        exp = 0;
      for (let k = start; k <= end; k++) {
        len += samples[k]!.w;
        exp += vals[k]! * samples[k]!.w;
      }
      const mid = Math.floor((start + end) / 2);
      hotspots.push({
        startIdx: start,
        endIdx: end,
        lengthM: len,
        exposure: exp,
        midpoint: samples[mid]!.p,
        bearingPoint: samples[Math.min(samples.length - 1, mid + 1)]!.p,
      });
    }
    start = -1;
  };
  vals.forEach((v, i) => {
    if (thr > 0 && v > thr) {
      if (start < 0) start = i;
    } else close(i - 1);
  });
  close(vals.length - 1);
  return {
    ...route,
    coverage,
    exposure,
    index: Math.round(exposure / C.displayDivisor),
    hotspots,
    hotspotMeters: hotspots.reduce((a, h) => a + h.lengthM, 0),
    contributors,
  };
}

/** Steps 2-8: fastest, budget, filter BEFORE scoring, score, 15% rule. */
export function recommend(
  candidates: CandidateRoute[],
  grid: RiskGrid | null,
  mode: TravelMode,
  hour: number,
  extraMin: number,
): Recommendation | null {
  if (!candidates.length) return null;
  const fastestC = candidates.reduce((a, b) => (b.durationSec < a.durationSec ? b : a));
  const maxAllowed = fastestC.durationSec + extraMin * 60;
  const eligible = candidates
    .filter((c) => c.durationSec <= maxAllowed)
    .map((c) => scoreRoute(c, grid, mode, hour));
  const fastest = eligible.find((e) => e.id === fastestC.id)!;
  const missing = eligible.find((route) => route.coverage !== "covered");
  if (missing)
    return {
      fastest,
      recommended: fastest,
      eligible,
      reason: missing.coverage as "unavailable" | "outside-coverage" | "unsupported-mode",
      improvement: 0,
      extraMin: 0,
    };
  const others = eligible.filter((e) => e.id !== fastest.id);
  if (!others.length) {
    return {
      fastest,
      recommended: fastest,
      eligible,
      reason: "no-alternative",
      improvement: 0,
      extraMin: 0,
    };
  }
  const best = others.reduce((a, b) => (b.exposure < a.exposure ? b : a));
  const improvement =
    fastest.exposure > 0 ? (fastest.exposure - best.exposure) / fastest.exposure : 0;
  if (improvement >= C.minImprovement) {
    return {
      fastest,
      recommended: best,
      eligible,
      reason: "improved",
      improvement,
      extraMin: Math.max(0, Math.round((best.durationSec - fastest.durationSec) / 60)),
    };
  }
  return {
    fastest,
    recommended: fastest,
    eligible,
    reason: "not-meaningful",
    improvement: Math.max(0, improvement),
    extraMin: 0,
  };
}

// Cached candidates are re-scored on every hour/budget change; polygon checks depend only on path.
const polygonCoverageCache = new WeakMap<CoverageGeoJSON, WeakMap<LatLng[], boolean>>();
function pathInsidePolygons(path: LatLng[], geometry: CoverageGeoJSON) {
  let byPath = polygonCoverageCache.get(geometry);
  if (!byPath) polygonCoverageCache.set(geometry, (byPath = new WeakMap()));
  let inside = byPath.get(path);
  if (inside === undefined) byPath.set(path, (inside = isPathInsideCoverage(path, geometry)));
  return inside;
}

/** Every sampled segment and endpoint must lie inside the documented coverage. */
export function routeCoverage(
  route: CandidateRoute,
  grid: RiskGrid | null,
  mode: TravelMode,
): ScoredRoute["coverage"] {
  if (!grid || grid.isDemo) return "unavailable";
  // A guarded grid without its loaded polygon mask must not score anything.
  if (grid.meta.requiresPolygonCoverageGuard && !grid.coverageGeometry) return "unavailable";
  if (!grid.meta.modes.includes(mode)) return "unsupported-mode";
  const m = grid.meta;
  const scale = 111320 * Math.cos(((m.projectionLatitude ?? m.originLat) * Math.PI) / 180);
  const b = m.coverageBounds ?? [
    m.originLon,
    m.originLat,
    m.originLon + (m.cols * m.cellSizeM) / scale,
    m.originLat + (m.rows * m.cellSizeM) / 111320,
  ];
  const inside = (p: { lat: number; lng: number }) =>
    p.lng >= b[0]! && p.lng < b[2]! && p.lat >= b[1]! && p.lat < b[3]!;
  if (
    route.path.length < 2 ||
    !route.path.every(inside) ||
    !samplePath(route.path, C.sampleSpacingM).every((s) => inside(s.p))
  )
    return "outside-coverage";
  // Whole segments, not just samples: a path can leave and re-enter between covered points.
  if (
    grid.meta.requiresPolygonCoverageGuard &&
    !pathInsidePolygons(route.path, grid.coverageGeometry!)
  )
    return "outside-coverage";
  return "covered";
}
export function hasExposureComparison(rec: Recommendation) {
  return ["improved", "not-meaningful", "no-alternative"].includes(rec.reason);
}
