import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { blendedValue } from "./exposureService";
import { distanceM, samplePath } from "./geo";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { LatLng } from "@/types/route";

/**
 * Grid-level analysis used to generate bypass candidates around high-exposure regions.
 * Everything is derived from the dataset's own metadata (cell size, projection, coverage) and
 * its own value distribution, so nothing assumes one city's resolution or normalization.
 */

const M_LAT = 111320;

export interface GridGeometry {
  grid: RiskGrid;
  mode: TravelMode;
  hour: number;
  cellM: number;
  mLng: number;
  /** Dataset-relative thresholds for this mode/time bucket. */
  highValue: number;
  medianValue: number;
  bounds: [number, number, number, number];
}

const thresholdCache = new WeakMap<RiskGrid, Map<string, { high: number; median: number }>>();

/** Quantiles of non-zero blended cell values, cached per grid × mode × time bucket. */
function thresholds(grid: RiskGrid, mode: TravelMode, hour: number) {
  const key = `${mode}:${C.bucketForHour(hour)}`;
  let byKey = thresholdCache.get(grid);
  if (!byKey) thresholdCache.set(grid, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const values: number[] = [];
  for (const cell of Object.values(grid.cells)) {
    const v = blendedValue(cell, mode, hour);
    if (v > 0) values.push(v);
  }
  values.sort((a, b) => a - b);
  const q = (p: number) => values[Math.floor(p * (values.length - 1))] ?? 0;
  const result = { high: q(C.corridor.highQuantile), median: q(0.5) };
  byKey.set(key, result);
  return result;
}

export function gridGeometry(grid: RiskGrid, mode: TravelMode, hour: number): GridGeometry {
  const m = grid.meta;
  const mLng = M_LAT * Math.cos(((m.projectionLatitude ?? m.originLat) * Math.PI) / 180);
  const t = thresholds(grid, mode, hour);
  return {
    grid,
    mode,
    hour,
    cellM: m.cellSizeM,
    mLng,
    highValue: t.high,
    medianValue: t.median,
    bounds: m.coverageBounds ?? [
      m.originLon,
      m.originLat,
      m.originLon + (m.cols * m.cellSizeM) / mLng,
      m.originLat + (m.rows * m.cellSizeM) / M_LAT,
    ],
  };
}

export const cellOf = (g: GridGeometry, p: LatLng) => ({
  r: Math.floor(((p.lat - g.grid.meta.originLat) * M_LAT) / g.cellM),
  c: Math.floor(((p.lng - g.grid.meta.originLon) * g.mLng) / g.cellM),
});
export const cellCenter = (g: GridGeometry, r: number, c: number): LatLng => ({
  lat: g.grid.meta.originLat + ((r + 0.5) * g.cellM) / M_LAT,
  lng: g.grid.meta.originLon + ((c + 0.5) * g.cellM) / g.mLng,
});
const keyOf = (r: number, c: number) => `${r}_${c}`;
export const cellValue = (g: GridGeometry, r: number, c: number) =>
  blendedValue(g.grid.cells[keyOf(r, c)], g.mode, g.hour);
/**
 * Street-environment value of a cell: mean of the cells with reported activity in its 3×3
 * neighbourhood. Google routes follow real streets, which can sit a cell away from any grid
 * path, so planning on the neighbourhood avoids threading corridors through single lighter
 * "holes" inside red areas. Null when nothing around has activity (water, parks, rail yards).
 */
export function localValue(g: GridGeometry, r: number, c: number): number | null {
  let sum = 0,
    n = 0;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (present(g, r + dr, c + dc)) {
        sum += cellValue(g, r + dr, c + dc);
        n++;
      }
  return n ? sum / n : null;
}
/**
 * Planning value for corridors. Areas with no street activity anywhere around them (water,
 * parks, rail yards, expressway strips) are not routable streets: Google would use the streets
 * next to them instead, so corridors may not pass through them (Infinity).
 */
export const planningValue = (g: GridGeometry, r: number, c: number) =>
  localValue(g, r, c) ?? Infinity;
/** Cells with reported activity: a proxy for "there are streets here" (parks/water are empty). */
const present = (g: GridGeometry, r: number, c: number) => !!g.grid.cells[keyOf(r, c)];
const inCoverage = (g: GridGeometry, p: LatLng) =>
  p.lng >= g.bounds[0] && p.lng < g.bounds[2] && p.lat >= g.bounds[1] && p.lat < g.bounds[3];

export interface RouteSample {
  p: LatLng;
  w: number;
  alongM: number;
  value: number;
}

export function sampleRoute(g: GridGeometry, path: LatLng[]): RouteSample[] {
  let along = 0;
  return samplePath(path, C.sampleSpacingM).map(({ p, w }) => {
    along += w;
    const { r, c } = cellOf(g, p);
    return { p, w, alongM: along, value: cellValue(g, r, c) };
  });
}

/** A stretch of the route inside high-exposure cells (adjacent stretches merged). */
export interface Crossing {
  startM: number;
  endM: number;
  exposure: number; // Σ value × metres over the stretch
  share: number; // of the whole route's exposure
  peak: number;
  /** Connected high-exposure region the stretch passes through (bounded flood fill). */
  regionCells: number;
  regionSpanM: number;
  isolated: boolean;
}

/**
 * Finds where the route runs through high-exposure cells, merging stretches separated by short
 * gaps (one region, not many hotspots), sized by the connected region around them.
 */
export function findCrossings(g: GridGeometry, samples: RouteSample[], routeExposure: number) {
  const gap = C.corridor.mergeGapM[g.mode];
  const runs: { from: number; to: number }[] = [];
  samples.forEach((s, i) => {
    if (s.value < g.highValue) return;
    const last = runs[runs.length - 1];
    if (last && s.alongM - samples[last.to]!.alongM <= gap) last.to = i;
    else runs.push({ from: i, to: i });
  });
  const crossings: Crossing[] = runs.map(({ from, to }) => {
    let exposure = 0;
    let peak = 0;
    const seeds: { r: number; c: number }[] = [];
    for (let i = from; i <= to; i++) {
      const s = samples[i]!;
      exposure += s.value * s.w;
      peak = Math.max(peak, s.value);
      if (s.value >= g.highValue) seeds.push(cellOf(g, s.p));
    }
    const region = floodRegion(g, seeds);
    return {
      startM: samples[from]!.alongM - samples[from]!.w,
      endM: samples[to]!.alongM,
      exposure,
      share: routeExposure > 0 ? exposure / routeExposure : 0,
      peak,
      regionCells: region.cells,
      regionSpanM: region.spanM,
      isolated: region.cells <= C.corridor.isolatedMaxCells,
    };
  });
  return crossings
    .filter((x) => x.share >= C.corridor.minShare)
    .sort((a, b) => b.exposure - a.exposure);
}

/** 8-connected high cells reachable from the seeds; bounded so huge regions stay cheap. */
function floodRegion(g: GridGeometry, seeds: { r: number; c: number }[]) {
  const seen = new Set<string>();
  const stack = seeds.filter(({ r, c }) => {
    const k = keyOf(r, c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let r0 = Infinity,
    r1 = -Infinity,
    c0 = Infinity,
    c1 = -Infinity;
  while (stack.length && seen.size < C.corridor.maxRegionCells) {
    const { r, c } = stack.pop()!;
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const k = keyOf(r + dr, c + dc);
        if (seen.has(k) || cellValue(g, r + dr, c + dc) < g.highValue) continue;
        seen.add(k);
        stack.push({ r: r + dr, c: c + dc });
      }
  }
  const spanM = Number.isFinite(r0) ? Math.max(r1 - r0 + 1, c1 - c0 + 1) * g.cellM : 0;
  return { cells: seen.size, spanM };
}

export interface Corridor {
  cells: { r: number; c: number }[];
  lengthM: number;
  exposure: number; // estimated Σ value × metres along the corridor
  /** The route stretch it replaces. */
  fromM: number;
  toM: number;
  /** Mean offset of the corridor from the route, as a compass label for explanations. */
  direction: string;
  maxOffsetM: number;
}

class MinHeap {
  private a: { k: number; v: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, v: number) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.k <= a[i]!.k) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.k < a[m]!.k) m = l;
        if (r < a.length && a[r]!.k < a[m]!.k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

const COMPASS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

/**
 * Least-cost corridor on the risk grid that replaces one crossing: from a little before the
 * crossing to a little after it, with the route's own stretch (± one cell) blocked so the
 * corridor must go around. Step cost = metres × (cell value + lambda); lambda trades extra
 * distance against exposure. Returns null when no corridor exists inside the search window.
 */
export function findCorridor(
  g: GridGeometry,
  samples: RouteSample[],
  crossing: Crossing,
  opts: { lambda: number; maxLateralM: number; avoid?: Set<string> },
): Corridor | null {
  const margin = C.corridor.entryMarginCells * g.cellM;
  const total = samples[samples.length - 1]?.alongM ?? 0;
  const fromM = Math.max(0, crossing.startM - margin);
  const toM = Math.min(total, crossing.endM + margin);
  const stretch = samples.filter((s) => s.alongM >= fromM && s.alongM <= toM);
  if (stretch.length < 2) return null;
  const start = cellOf(g, stretch[0]!.p);
  const goal = cellOf(g, stretch[stretch.length - 1]!.p);

  // Search window: the stretch's bounding box widened by the lateral reach.
  const pad = Math.ceil(opts.maxLateralM / g.cellM);
  let r0 = Infinity,
    r1 = -Infinity,
    c0 = Infinity,
    c1 = -Infinity;
  for (const s of stretch) {
    const { r, c } = cellOf(g, s.p);
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  }
  r0 = Math.max(0, r0 - pad);
  c0 = Math.max(0, c0 - pad);
  r1 = Math.min(g.grid.meta.rows - 1, r1 + pad);
  c1 = Math.min(g.grid.meta.cols - 1, c1 + pad);
  const W = c1 - c0 + 1,
    H = r1 - r0 + 1;
  if (W * H > C.corridor.maxWindowCells || W <= 0 || H <= 0) return null;
  const idx = (r: number, c: number) => (r - r0) * W + (c - c0);

  // Block the route's own stretch (and neighbours) except near the two ends.
  const blocked = new Uint8Array(W * H);
  const endClear = 1.5 * g.cellM;
  for (const s of samplePath(
    stretch.map((x) => x.p),
    g.cellM / 2,
  )) {
    const a = distanceM(s.p, stretch[0]!.p),
      b = distanceM(s.p, stretch[stretch.length - 1]!.p);
    if (a < endClear || b < endClear) continue;
    const { r, c } = cellOf(g, s.p);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr,
          cc = c + dc;
        if (rr >= r0 && rr <= r1 && cc >= c0 && cc <= c1) blocked[idx(rr, cc)] = 1;
      }
  }
  if (opts.avoid)
    for (const k of opts.avoid) {
      const [rr, cc] = k.split("_").map(Number) as [number, number];
      if (rr >= r0 && rr <= r1 && cc >= c0 && cc <= c1) blocked[idx(rr, cc)] = 1;
    }
  for (const p of [start, goal])
    if (p.r >= r0 && p.r <= r1 && p.c >= c0 && p.c <= c1) blocked[idx(p.r, p.c)] = 0;

  const cost = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const heap = new MinHeap();
  const s0 = idx(start.r, start.c),
    goalI = idx(goal.r, goal.c);
  if (s0 < 0 || s0 >= W * H || goalI < 0 || goalI >= W * H) return null;
  cost[s0] = 0;
  heap.push(0, s0);
  while (heap.size) {
    const { k, v } = heap.pop();
    if (k > cost[v]!) continue;
    if (v === goalI) break;
    const r = r0 + Math.floor(v / W),
      c = c0 + (v % W);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr,
          cc = c + dc;
        if (rr < r0 || rr > r1 || cc < c0 || cc > c1) continue;
        const n = idx(rr, cc);
        if (blocked[n]) continue;
        if (!inCoverage(g, cellCenter(g, rr, cc))) continue;
        const step = (dr && dc ? Math.SQRT2 : 1) * g.cellM;
        const v2 = planningValue(g, rr, cc);
        if (!Number.isFinite(v2)) continue;
        const next = k + step * (v2 + opts.lambda);
        if (next < cost[n]!) {
          cost[n] = next;
          prev[n] = v;
          heap.push(next, n);
        }
      }
  }
  if (!Number.isFinite(cost[goalI]!)) return null;
  const cells: { r: number; c: number }[] = [];
  for (let v = goalI; v !== -1; v = prev[v]!)
    cells.push({ r: r0 + Math.floor(v / W), c: c0 + (v % W) });
  cells.reverse();

  let lengthM = 0,
    exposure = 0,
    maxOffsetM = 0,
    dx = 0,
    dy = 0;
  const routePts = stretch.map((s) => s.p);
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1]!,
      b = cells[i]!;
    const step = (a.r !== b.r && a.c !== b.c ? Math.SQRT2 : 1) * g.cellM;
    lengthM += step;
    exposure += step * planningValue(g, b.r, b.c);
  }
  for (const cell of cells) {
    const p = cellCenter(g, cell.r, cell.c);
    let best = Infinity,
      near = routePts[0]!;
    for (const q of routePts) {
      const d = distanceM(p, q);
      if (d < best) {
        best = d;
        near = q;
      }
    }
    if (best > maxOffsetM) maxOffsetM = best;
    dx += (p.lng - near.lng) * g.mLng;
    dy += (p.lat - near.lat) * M_LAT;
  }
  const angle = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return {
    cells,
    lengthM,
    exposure,
    fromM,
    toM,
    direction: COMPASS[Math.round(angle / 45) % 8]!,
    maxOffsetM,
  };
}

/**
 * Evenly spaced via waypoints along a corridor, each snapped to a nearby cell that has street
 * activity and is below the high threshold, so Google follows the corridor instead of a spur.
 */
export function corridorWaypoints(g: GridGeometry, corridor: Corridor, count: number): LatLng[] {
  const cum = [0];
  for (let i = 1; i < corridor.cells.length; i++) {
    const a = corridor.cells[i - 1]!,
      b = corridor.cells[i]!;
    cum.push(cum[i - 1]! + (a.r !== b.r && a.c !== b.c ? Math.SQRT2 : 1) * g.cellM);
  }
  const out: LatLng[] = [];
  for (let k = 1; k <= count; k++) {
    const target = (corridor.lengthM * k) / (count + 1);
    let i = cum.findIndex((d) => d >= target);
    if (i < 0) i = cum.length - 1;
    // The calmest street cell near this point whose whole neighbourhood is below the threshold.
    const pick = [0, 1, -1, 2, -2, 3, -3]
      .map((o) => corridor.cells[i + o])
      .filter(
        (cell): cell is { r: number; c: number } =>
          !!cell &&
          present(g, cell.r, cell.c) &&
          cellValue(g, cell.r, cell.c) < g.highValue &&
          (localValue(g, cell.r, cell.c) ?? Infinity) < g.highValue,
      )
      .sort((a, b) => localValue(g, a.r, a.c)! - localValue(g, b.r, b.c)!)[0];
    if (pick) out.push(cellCenter(g, pick.r, pick.c));
  }
  return out;
}

/** The stretch a corridor replaces, measured with the same neighbourhood values as corridors. */
export function stretchPlanningExposure(
  g: GridGeometry,
  samples: RouteSample[],
  fromM: number,
  toM: number,
) {
  let e = 0;
  for (const s of samples)
    if (s.alongM >= fromM && s.alongM <= toM) {
      const { r, c } = cellOf(g, s.p);
      // The route itself is a real street even where nothing around reports activity.
      e += (localValue(g, r, c) ?? s.value) * s.w;
    }
  return e;
}
