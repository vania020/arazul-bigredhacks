import { distanceM } from "@/services/geo";
import type { CandidateRoute, LatLng } from "@/types/route";
import { measurePath, type MeasuredPath } from "./geometry";

export interface NavStep {
  index: number;
  instruction: string; // first line of Google's instruction
  detail: string | null; // any following lines ("Destination will be on the right")
  maneuver: string; // Google maneuver enum, "DEPART" for step 0 when unspecified
  startM: number; // along-route distance of this step's maneuver point
  endM: number;
  durationSec: number; // static duration
  location: LatLng;
}

/** The route being navigated: Arazul's chosen geometry plus Google's steps for it. */
export interface NavRoute extends MeasuredPath {
  id: string;
  steps: NavStep[];
  durationSec: number; // route-level (traffic-aware when driving)
  staticTotalSec: number;
  destination: LatLng;
  hasGoogleSteps: boolean;
}

const SAME_POINT_M = 0.5;

/**
 * Concatenates step paths so step boundaries are exact vertices of the navigated path.
 * Falls back to the route path with a single "follow route" step when Google sent no steps.
 */
export function buildNavRoute(route: CandidateRoute, followText: string): NavRoute {
  const steps = route.steps?.filter((s) => s.path.length > 0) ?? [];
  const path: LatLng[] = [];
  const startIdx: number[] = [];
  for (const s of steps) {
    startIdx.push(Math.max(0, path.length - 1));
    s.path.forEach((p, i) => {
      const last = path[path.length - 1];
      if (i === 0 && last && distanceM(last, p) < SAME_POINT_M) return;
      path.push(p);
    });
  }
  const useSteps = steps.length > 0 && path.length >= 2;
  const mp = measurePath(useSteps ? path : route.path);
  const navSteps: NavStep[] = useSteps
    ? steps.map((s, i) => {
        const [first, ...rest] = s.instruction.split("\n").map((l) => l.trim());
        const startM = mp.cum[startIdx[i]!] ?? 0;
        return {
          index: i,
          instruction: first || followText,
          detail: rest.filter(Boolean).join(" ") || null,
          maneuver:
            s.maneuver && s.maneuver !== "MANEUVER_UNSPECIFIED"
              ? s.maneuver
              : i === 0
                ? "DEPART"
                : "STRAIGHT",
          startM,
          endM: 0,
          durationSec: s.durationSec,
          location: mp.path[startIdx[i]!] ?? mp.path[0]!,
        };
      })
    : [
        {
          index: 0,
          instruction: followText,
          detail: null,
          maneuver: "DEPART",
          startM: 0,
          endM: 0,
          durationSec: route.durationSec,
          location: mp.path[0]!,
        },
      ];
  navSteps.forEach((s, i) => (s.endM = navSteps[i + 1]?.startM ?? mp.lengthM));
  return {
    ...mp,
    id: route.id,
    steps: navSteps,
    durationSec: route.durationSec,
    staticTotalSec: navSteps.reduce((a, s) => a + s.durationSec, 0),
    destination: mp.path[mp.path.length - 1]!,
    hasGoogleSteps: useSteps,
  };
}
