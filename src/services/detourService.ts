import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { pathSimilar, perpendicularOffset } from "./geo";
import { computeRoutes, type RouteQuery } from "./routingService";
import type { CandidateRoute, ScoredRoute } from "@/types/route";

/** Builds via-points beside the fastest route's top hotspots and asks Google for detours. */
export async function generateDetours(
  fastest: ScoredRoute, base: Omit<RouteQuery, "intermediates" | "alternatives">, maxDurationSec: number,
): Promise<CandidateRoute[]> {
  const top = [...fastest.hotspots].sort((a, b) => b.exposure - a.exposure).slice(0, C.detour.maxHotspots);
  const vias = top.flatMap((h) =>
    C.detour.offsetsM.map((m) => perpendicularOffset(h.midpoint, h.midpoint, h.bearingPoint, m)),
  ).slice(0, C.detour.maxRequests);

  const results: CandidateRoute[] = [];
  let i = 0;
  const worker = async () => {
    while (i < vias.length) {
      const via = vias[i++]!;
      try {
        const r = await computeRoutes({ ...base, intermediates: [via], alternatives: false });
        results.push(...r);
      } catch { /* silent: detours are optional */ }
    }
  };
  await Promise.all(Array.from({ length: C.detour.concurrency }, worker));
  return results.filter((r) => r.durationSec <= maxDurationSec);
}

export function dedupeRoutes(routes: CandidateRoute[]): CandidateRoute[] {
  const out: CandidateRoute[] = [];
  for (const r of routes) {
    if (!out.some((o) => pathSimilar(o.path, r.path, C.detour.duplicateMeanDistanceM))) out.push(r);
  }
  return out;
}
