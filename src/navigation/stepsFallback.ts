import { NAVIGATION_CONFIG as N } from "@/config/navigationConfig";
import { computeRoutes } from "@/services/routingService";
import { pathSimilar } from "@/services/geo";
import type { TravelMode } from "@/types/risk";
import type { CandidateRoute, LatLng } from "@/types/route";
import { measurePath, pointAlong } from "./geometry";

/** Evenly spaced interior points of an Arazul path, used as Google via waypoints. */
export function viaPointsAlong(path: LatLng[], count: number): LatLng[] {
  const mp = measurePath(path);
  if (mp.lengthM <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) =>
    pointAlong(mp, (mp.lengthM * (i + 1)) / (count + 1)),
  );
}

/**
 * For an Arazul route that arrived without Google navigation steps: ask Google for the same
 * geometry through via waypoints taken from it, so Google supplies instructions for *this* route.
 * The result is accepted only if it stays on Arazul's geometry; otherwise null (navigation then
 * follows the geometry with a single "follow the route" instruction rather than another route).
 */
export async function fetchStepsFor<T extends CandidateRoute>(
  route: T,
  mode: TravelMode,
  language?: string,
): Promise<T | null> {
  if (route.path.length < 2) return null;
  const origin = route.path[0]!;
  const destination = route.path[route.path.length - 1]!;
  const [google] = await computeRoutes({
    origin: { label: "", latLng: origin },
    destination: { label: "", latLng: destination },
    mode,
    departure: null,
    intermediates: viaPointsAlong(route.path, N.stepsFallback.viaPoints),
    alternatives: false,
    ...(language ? { language } : {}),
  });
  if (!google?.steps?.length) return null;
  if (!pathSimilar(route.path, google.path, N.stepsFallback.maxMeanDeviationM)) return null;
  // Keep Arazul's identity and scored metrics; take Google's matching geometry and steps.
  return { ...route, path: google.path, steps: google.steps };
}
