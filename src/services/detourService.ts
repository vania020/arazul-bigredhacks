import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { routeCoverage } from "./exposureService";
import { pathProximity, perpendicularOffset, routeOverlap } from "./geo";
import { computeRoutes, type RouteQuery } from "./routingService";
import {
  corridorWaypoints,
  findCorridor,
  findCrossings,
  gridGeometry,
  sampleRoute,
  stretchPlanningExposure,
  type Corridor,
  type Crossing,
} from "./riskRegions";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { CandidateRoute, LatLng, ScoredRoute } from "@/types/route";

type BaseQuery = Omit<RouteQuery, "intermediates" | "alternatives">;

/** Grid context enables region-aware bypasses; without it the local strategy is used. */
export interface DetourContext {
  grid: RiskGrid;
  mode: TravelMode;
  hour: number;
  /** Routes already known (e.g. Google alternatives): corridors they cover aren't re-requested. */
  known?: CandidateRoute[];
  trace?: DetourTrace;
}

export type RequestStatus =
  | "ok"
  | "no-route"
  | "error"
  | "over-max-time"
  | "skipped-duplicate-request"
  | "skipped-already-covered"
  | "skipped-no-street-cells"
  | "skipped-budget"
  | "outside-coverage";

/** Development diagnostics: what was generated, requested, and dropped, and why. */
export interface DetourTrace {
  strategy?: "corridor" | "local";
  thresholds?: { high: number; median: number; cellM: number; maxLateralM: number };
  crossings?: (Pick<
    Crossing,
    "startM" | "endM" | "share" | "peak" | "regionCells" | "regionSpanM" | "isolated"
  > & { index: number })[];
  corridors?: {
    label: string;
    crossing: number;
    lengthM: number;
    replacesM: number;
    estGainPct: number;
    estExtraMin: number;
    maxOffsetM: number;
    status: "planned" | "too-long" | "too-little-gain" | "same-corridor" | "none-found";
  }[];
  requests: {
    label: string;
    waypoints: LatLng[];
    status: RequestStatus;
    routeId?: string;
    durationSec?: number;
    detail?: string;
  }[];
  duplicates: { dropped: string; keptAs: string; overlapPct: number }[];
}

/**
 * Asks Google for candidate routes that avoid the fastest route's highest-exposure parts.
 * Bounded by C.detour.maxRequests (6) Google requests per call.
 * - Region-aware ("corridor") strategy when grid context is given and the route crosses
 *   high-exposure cells: bypass corridors around each major crossing, both sides, via waypoints
 *   spaced along the corridor so Google follows it instead of touching one point.
 * - Otherwise the original local strategy: one waypoint offset beside each top hotspot.
 * Results slower than maxDurationSec (the largest extra-time setting) are dropped.
 */
export async function generateDetours(
  fastest: ScoredRoute,
  base: BaseQuery,
  maxDurationSec: number,
  ctx?: DetourContext,
): Promise<CandidateRoute[]> {
  if (ctx && ctx.grid.meta.modes.includes(ctx.mode)) {
    const routes = await corridorDetours(fastest, base, maxDurationSec, ctx);
    if (routes) return routes;
  }
  if (ctx?.trace) ctx.trace.strategy = "local";
  return localDetours(fastest, base, maxDurationSec, ctx?.trace);
}

/** Original strategy: perpendicular offsets beside the top route-relative hotspots. */
async function localDetours(
  fastest: ScoredRoute,
  base: BaseQuery,
  maxDurationSec: number,
  trace?: DetourTrace,
): Promise<CandidateRoute[]> {
  const top = [...fastest.hotspots]
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, C.detour.maxHotspots);
  const vias = top
    .flatMap((h, hi) =>
      C.detour.offsetsM.map((m) => ({
        via: perpendicularOffset(h.midpoint, h.midpoint, h.bearingPoint, m),
        label: `Local detour ${hi + 1} (${m > 0 ? "left" : "right"} ${Math.abs(m)} m)`,
      })),
    )
    .slice(0, C.detour.maxRequests);

  const results: CandidateRoute[] = [];
  let i = 0;
  const worker = async () => {
    while (i < vias.length) {
      const { via, label } = vias[i++]!;
      const entry = trace && { label, waypoints: [via], status: "ok" as RequestStatus };
      try {
        const r = await computeRoutes({ ...base, intermediates: [via], alternatives: false });
        if (!r.length && entry) entry.status = "no-route";
        for (const route of r) {
          if (entry) Object.assign(entry, { routeId: route.id, durationSec: route.durationSec });
          if (route.durationSec > maxDurationSec) {
            if (entry) entry.status = "over-max-time";
          } else results.push({ ...route, label });
        }
      } catch (e) {
        if (entry) Object.assign(entry, { status: "error", detail: String(e) });
      }
      if (entry) trace.requests.push(entry);
    }
  };
  await Promise.all(Array.from({ length: C.detour.concurrency }, worker));
  return results;
}

interface Plan {
  label: string;
  crossing: number;
  corridor: Corridor;
  waypoints: number;
  score: number;
}

/** Region-aware strategy; null when the route crosses no meaningful high-exposure region. */
async function corridorDetours(
  fastest: ScoredRoute,
  base: BaseQuery,
  maxDurationSec: number,
  ctx: DetourContext,
): Promise<CandidateRoute[] | null> {
  const { trace } = ctx;
  const g = gridGeometry(ctx.grid, ctx.mode, ctx.hour);
  const samples = sampleRoute(g, fastest.path);
  const totalM = samples[samples.length - 1]?.alongM ?? 0;
  const crossings = findCrossings(g, samples, fastest.exposure).slice(0, C.corridor.maxCrossings);
  // Lateral reach from the trip's own speed and the largest extra-time setting (mode-aware).
  const speed = fastest.distanceMeters / Math.max(1, fastest.durationSec);
  const maxExtraSec = Math.max(0, maxDurationSec - fastest.durationSec);
  const maxLateralM = Math.max(
    2 * g.cellM,
    Math.min(C.corridor.maxLateralM[ctx.mode], (speed * maxExtraSec) / 2, totalM * 0.6),
  );
  if (trace) {
    trace.thresholds = {
      high: g.highValue,
      median: g.medianValue,
      cellM: g.cellM,
      maxLateralM: Math.round(maxLateralM),
    };
    trace.crossings = crossings.map((x, index) => ({
      index: index + 1,
      startM: Math.round(x.startM),
      endM: Math.round(x.endM),
      share: x.share,
      peak: x.peak,
      regionCells: x.regionCells,
      regionSpanM: x.regionSpanM,
      isolated: x.isolated,
    }));
    trace.corridors = [];
  }
  if (!crossings.length) return null;
  if (trace) trace.strategy = "corridor";

  // 1. Plan corridors per crossing: balanced and wide variants, then the best one blocked so the
  //    search must find a different corridor (usually the other side of the region).
  const plans: Plan[] = [];
  crossings.forEach((crossing, ci) => {
    const forCrossing: Plan[] = [];
    const consider = (corridor: Corridor | null, variant: string) => {
      if (!corridor) {
        // Recorded so "no lower-exposure corridor exists here" is visible, not silent.
        trace?.corridors?.push({
          label: `Bypass ${ci + 1} (${variant})`,
          crossing: ci + 1,
          lengthM: 0,
          replacesM: 0,
          estGainPct: 0,
          estExtraMin: 0,
          maxOffsetM: 0,
          status: "none-found",
        });
        return;
      }
      // Same (neighbourhood) measure on both sides: raw route cells vs smoothed corridor cells
      // would systematically flatter every corridor.
      const replacedExposure = stretchPlanningExposure(g, samples, corridor.fromM, corridor.toM);
      const replacesM = corridor.toM - corridor.fromM;
      const estGain = (replacedExposure - corridor.exposure) / Math.max(1, fastest.exposure);
      // Streets wind more than a grid path: scale by a typical urban circuity factor.
      const estExtraSec =
        (corridor.lengthM * C.corridor.circuity - replacesM) / Math.max(0.5, speed);
      const label = `Bypass ${ci + 1} · ${corridor.direction} (${variant})`;
      const dup = forCrossing.some((p) => overlapCells(p.corridor, corridor) > 0.6);
      const status = dup
        ? "same-corridor"
        : estExtraSec > maxExtraSec * 1.25
          ? "too-long"
          : estGain < C.corridor.minEstimatedGain
            ? "too-little-gain"
            : "planned";
      trace?.corridors?.push({
        label,
        crossing: ci + 1,
        lengthM: Math.round(corridor.lengthM),
        replacesM: Math.round(replacesM),
        estGainPct: Math.round(estGain * 100),
        estExtraMin: Math.round(estExtraSec / 6) / 10,
        maxOffsetM: Math.round(corridor.maxOffsetM),
        status,
      });
      if (status !== "planned") return;
      forCrossing.push({
        label,
        crossing: ci,
        corridor,
        waypoints: Math.min(
          C.corridor.maxWaypoints,
          Math.max(1, Math.round(corridor.lengthM / C.corridor.waypointSpacingM[ctx.mode])),
        ),
        score: estGain / (1 + Math.max(0, estExtraSec) / 300),
      });
    };
    C.corridor.lambdaFactors.forEach((f, i) =>
      consider(
        findCorridor(g, samples, crossing, { lambda: f * g.highValue, maxLateralM }),
        i === 0 ? "balanced" : "wide",
      ),
    );
    const best = [...forCrossing].sort((a, b) => b.score - a.score)[0];
    if (best) {
      const avoid = new Set<string>();
      // Both sides may share the entry and exit; only the corridor's middle is avoided.
      for (const { r, c } of best.corridor.cells.slice(3, -3))
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) avoid.add(`${r + dr}_${c + dc}`);
      consider(
        findCorridor(g, samples, crossing, { lambda: g.highValue, maxLateralM, avoid }),
        "alternate side",
      );
    }
    plans.push(...forCrossing);
  });
  plans.sort((a, b) => b.score - a.score);

  // 2. Request bypasses within the budget, best estimated corridors first.
  const known = [fastest, ...(ctx.known ?? [])];
  const requested: LatLng[][] = [];
  const results: { plan: Plan; route: CandidateRoute }[] = [];
  let budget = C.detour.maxRequests;
  const request = async (plan: Plan, count: number, suffix = "") => {
    const label = plan.label + suffix;
    const waypoints = corridorWaypoints(g, plan.corridor, count);
    const entry = {
      label,
      waypoints,
      status: "ok" as RequestStatus,
    } as DetourTrace["requests"][number];
    trace?.requests.push(entry);
    if (!waypoints.length) return void (entry.status = "skipped-no-street-cells");
    if (requested.some((w) => sameWaypoints(w, waypoints, g.cellM)))
      return void (entry.status = "skipped-duplicate-request");
    const covering = [...known, ...results.map((x) => x.route)].find((r) => {
      const near = pathProximity(r.path);
      return waypoints.every((p) => near(p, 40));
    });
    if (covering)
      return void Object.assign(entry, {
        status: "skipped-already-covered",
        detail: covering.label ?? covering.id,
      });
    if (budget <= 0) return void (entry.status = "skipped-budget");
    budget--;
    requested.push(waypoints);
    try {
      const [route] = await computeRoutes({
        ...base,
        intermediates: waypoints,
        alternatives: false,
      });
      if (!route) return void (entry.status = "no-route");
      Object.assign(entry, { routeId: route.id, durationSec: route.durationSec });
      if (route.durationSec > maxDurationSec) return void (entry.status = "over-max-time");
      // A candidate outside coverage would void the whole comparison: never add one.
      if (routeCoverage(route, ctx.grid, ctx.mode) !== "covered")
        return void (entry.status = "outside-coverage");
      results.push({ plan, route: { ...route, label } });
    } catch (e) {
      Object.assign(entry, { status: "error", detail: String(e) });
    }
  };

  const first = plans.slice(0, Math.min(C.corridor.firstRound, budget));
  await Promise.all(first.map((p) => request(p, p.waypoints)));

  // Second round: the next-ranked corridors with what is left of the budget. (Adding waypoints
  // to a corridor Google did not follow was measured to make routes slower and worse.)
  const second = plans.slice(first.length, first.length + Math.max(0, budget));
  await Promise.all(second.map((p) => request(p, p.waypoints)));
  return results.map((x) => x.route);
}

function overlapCells(a: Corridor, b: Corridor) {
  const set = new Set(a.cells.map(({ r, c }) => `${r}_${c}`));
  const shared = b.cells.filter(({ r, c }) => set.has(`${r}_${c}`)).length;
  return shared / Math.max(1, Math.min(a.cells.length, b.cells.length));
}

function sameWaypoints(a: LatLng[], b: LatLng[], tolM: number) {
  if (a.length !== b.length) return false;
  const M = 111320;
  return a.every((p, i) => {
    const q = b[i]!;
    return (
      Math.hypot((p.lat - q.lat) * M, (p.lng - q.lng) * M * Math.cos((p.lat * Math.PI) / 180)) <=
      tolM
    );
  });
}

/**
 * Keeps the first of any routes that share nearly all of their geometry (both directions), so
 * near-identical Google responses are scored and shown once.
 */
export function dedupeRoutes(routes: CandidateRoute[], trace?: DetourTrace): CandidateRoute[] {
  const out: { route: CandidateRoute; near: (p: LatLng, tol: number) => boolean }[] = [];
  const tol = C.detour.duplicateMeanDistanceM;
  for (const r of routes) {
    const nearR = pathProximity(r.path);
    const dup = out.find(
      (o) =>
        routeOverlap(r.path, o.near, tol) >= C.detour.duplicateOverlap &&
        routeOverlap(o.route.path, nearR, tol) >= C.detour.duplicateOverlap,
    );
    if (dup) {
      trace?.duplicates.push({
        dropped: r.label ?? r.id,
        keptAs: dup.route.label ?? dup.route.id,
        overlapPct: Math.round(routeOverlap(r.path, dup.near, tol) * 100),
      });
      continue;
    }
    out.push({ route: r, near: nearR });
  }
  return out.map((o) => o.route);
}
