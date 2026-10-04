import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { NAVIGATION_CONFIG as N } from "@/config/navigationConfig";
import { computeRoutes, type RouteQuery } from "@/services/routingService";
import { dedupeRoutes, generateDetours } from "@/services/detourService";
import { recommend, routeCoverage, scoreRoute } from "@/services/exposureService";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type {
  CandidateRoute,
  LatLng,
  LocationValue,
  Recommendation,
  ScoredRoute,
} from "@/types/route";
import { measurePath, pointAlong, projectOnPath } from "./geometry";

/**
 * Which Arazul choice the user is navigating. Kept for the whole session so reroutes repeat it:
 * - recommended: lowest reported exposure within the extra-time budget (Arazul's pick);
 * - fastest: shortest travel time, still scored;
 * - custom: a specific alternative the user chose, so reroutes rejoin that geometry.
 */
export type RoutePreference = "recommended" | "fastest" | "custom";

export interface RerouteInput {
  from: LatLng;
  fromLabel: string;
  destination: LocationValue;
  mode: TravelMode;
  preference: RoutePreference;
  grid: RiskGrid | null;
  /** The planning hour the original route was scored for (not the device clock). */
  hour: number;
  extraMin: number;
  language?: string;
  /** The route being abandoned, so its remaining geometry can be preserved. */
  previous: { path: LatLng[]; via?: LatLng[] };
  /** Last matched along-route position on the previous route, if any. */
  resumeFromM: number | null;
}

/**
 * How the new route was chosen, so the UI only claims what was actually compared:
 * - compared: Arazul scored two or more comparable candidates;
 * - rejoin: the route back onto the previously selected route (no new comparison);
 * - only-option: Google returned a single route (fastest preference only).
 */
export type RerouteBasis = "compared" | "rejoin" | "only-option";

export interface ReroutePlan {
  route: ScoredRoute;
  rec: Recommendation;
  basis: RerouteBasis;
  /** Google route requests used for this plan (reported in diagnostics). */
  requests: number;
}

export type RerouteErrorCode = "NO_ROUTE" | "NO_SAFE_ROUTE";

/** A reroute that could not preserve the user's preference; nothing is substituted. */
export class RerouteError extends Error {
  constructor(
    readonly code: RerouteErrorCode,
    readonly failures: string[],
    readonly requests: number,
  ) {
    super(code);
    this.name = "RerouteError";
  }
}

/** Error text safe for the console: never includes an API key. */
export function describeFailure(e: unknown): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-key]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 300);
}

export interface RejoinPlan {
  vias: LatLng[];
  /** Within the last stretch: the destination itself is where the previous route rejoins. */
  finalApproach: boolean;
}

/**
 * Via waypoints that bring the user back onto the remaining previous route: a rejoin point a
 * little ahead of where they are closest to it, plus any of its own detour waypoints still ahead.
 */
export function rejoinWaypoints(
  previous: { path: LatLng[]; via?: LatLng[] },
  from: LatLng,
  resumeFromM: number | null,
  aheadM: number,
  finalApproachM: number,
): RejoinPlan {
  if (previous.path.length < 2) return { vias: [], finalApproach: false };
  const mp = measurePath(previous.path);
  const start = Math.min(mp.lengthM, Math.max(0, resumeFromM ?? 0));
  const closest = projectOnPath(mp, from, start, mp.lengthM)?.alongM ?? start;
  const remaining = mp.lengthM - closest;
  if (remaining <= finalApproachM) return { vias: [], finalApproach: true };
  const rejoinAt = closest + Math.min(aheadM, remaining / 2);
  const later = (previous.via ?? [])
    .map((v) => ({ v, along: projectOnPath(mp, v)?.alongM ?? -1 }))
    .filter((x) => x.along > rejoinAt + 20)
    .sort((a, b) => a.along - b.along)
    .map((x) => x.v);
  return { vias: [pointAlong(mp, rejoinAt), ...later], finalApproach: false };
}

/**
 * Plans a new route from the device location that repeats the user's Arazul choice.
 * Google only supplies candidate geometry/steps; Arazul decides which one is followed, and
 * never substitutes Google's fastest route for a recommended or custom choice.
 */
export async function planReroute(input: RerouteInput): Promise<ReroutePlan> {
  const { mode, grid, hour, extraMin, preference } = input;
  const origin: LocationValue = { label: input.fromLabel, latLng: input.from };
  const base = {
    origin,
    destination: input.destination,
    mode,
    departure: null,
    ...(input.language ? { language: input.language } : {}),
  };
  let requests = 0;
  const failures: string[] = [];
  const request = async (label: string, q: RouteQuery) => {
    requests++;
    try {
      return await computeRoutes(q);
    } catch (e) {
      failures.push(`${label}: ${describeFailure(e)}`);
      return [];
    }
  };
  const alternatives = () => request("alternatives", { ...base, alternatives: true });
  const rejoin = async (): Promise<CandidateRoute[]> => {
    const plan = rejoinWaypoints(
      input.previous,
      input.from,
      input.resumeFromM,
      N.reroute.rejoinAheadM[mode],
      N.reroute.finalApproachM[mode],
    );
    if (plan.finalApproach)
      return request("rejoin (final approach)", { ...base, alternatives: false });
    if (!plan.vias.length) return [];
    const routes = await request("rejoin", {
      ...base,
      intermediates: plan.vias,
      alternatives: false,
    });
    return routes.slice(0, 1);
  };
  const fail = (code: RerouteErrorCode): never => {
    throw new RerouteError(code, failures, requests);
  };
  const single = (route: CandidateRoute) => recommend([route], grid, mode, hour, extraMin)!;

  if (preference === "fastest") {
    const alts = await alternatives();
    if (!alts.length) fail("NO_ROUTE");
    const rec = recommend(alts, grid, mode, hour, extraMin)!;
    return {
      route: rec.fastest,
      rec,
      basis: alts.length > 1 ? "compared" : "only-option",
      requests,
    };
  }

  if (preference === "custom") {
    // The user chose this geometry: only ever guide them back onto it.
    const [back] = await rejoin();
    if (!back) return fail("NO_SAFE_ROUTE");
    const rec = single(back);
    return { route: rec.fastest, rec, basis: "rejoin", requests };
  }

  // recommended: compare only candidates that can be validly risk-scored.
  const [alts, back] = await Promise.all([alternatives(), rejoin()]);
  const comparable = (routes: CandidateRoute[]) =>
    grid ? routes.filter((r) => routeCoverage(r, grid, mode) === "covered") : [];
  let pool = comparable([...alts, ...back]);
  const coveredAlts = comparable(alts);
  if (grid && coveredAlts.length) {
    const fastestC = coveredAlts.reduce((a, b) => (b.durationSec < a.durationSec ? b : a));
    const fastest = scoreRoute(fastestC, grid, mode, hour);
    requests += Math.min(
      C.detour.maxRequests,
      Math.min(C.detour.maxHotspots, fastest.hotspots.length) * C.detour.offsetsM.length,
    );
    const detours = await generateDetours(
      fastest,
      base,
      fastestC.durationSec + C.extraTime.max * 60,
    ).catch((e) => {
      failures.push(`detours: ${describeFailure(e)}`);
      return [];
    });
    pool.push(...comparable(detours));
  }
  pool = dedupeRoutes(pool);
  if (pool.length >= 2) {
    const rec = recommend(pool, grid, mode, hour, extraMin)!;
    return { route: rec.recommended, rec, basis: "compared", requests };
  }
  // No valid comparison (outside coverage, no data, or a single scorable option):
  // keep following the previously selected Arazul route rather than Google's default.
  const [rejoined] = back;
  if (rejoined) {
    const rec = single(rejoined);
    return { route: rec.fastest, rec, basis: "rejoin", requests };
  }
  return fail("NO_SAFE_ROUTE");
}
