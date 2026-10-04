import { NAVIGATION_CONFIG as N } from "@/config/navigationConfig";
import { distanceM } from "@/services/geo";
import type { TravelMode } from "@/types/risk";
import type { LatLng } from "@/types/route";
import { bearingAlong, pointAlong, projectOnPath, type Projection } from "./geometry";
import type { NavRoute, NavStep } from "./navRoute";

/** One browser geolocation reading, kept in memory only. */
export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  timestamp: number;
}

export interface TrackerState {
  alongM: number | null; // last confident along-route position
  stepIndex: number;
  offRouteCount: number;
  offRouteSince: number | null;
  arrivalCount: number;
  last: { p: LatLng; t: number } | null;
}

export type FixQuality = "good" | "weak" | "ignored";
export type Maneuver = NavStep | "arrive";

export interface Progress {
  alongM: number;
  stepIndex: number;
  remainingM: number;
  remainingSec: number;
  distanceToManeuverM: number;
  /** Instruction to show prominently: the upcoming maneuver (or the departure step at the start). */
  primary: Maneuver;
  then: Maneuver | null;
  departing: boolean;
}

export interface TrackResult {
  state: TrackerState;
  quality: FixQuality;
  /** Trusted reading inside the on-route corridor. */
  onRoute: boolean;
  lateralM: number | null;
  /** Snapped to the route when on it; raw otherwise. */
  displayPoint: LatLng;
  headingDeg: number | null;
  /** Confirmed off-route: enough consecutive trusted readings over enough time. */
  offRoute: boolean;
  arrived: boolean;
  progress: Progress | null;
}

export const initialTracker = (): TrackerState => ({
  alongM: null,
  stepIndex: 0,
  offRouteCount: 0,
  offRouteSince: null,
  arrivalCount: 0,
  last: null,
});

export function toleranceM(mode: TravelMode, accuracyM: number) {
  return N.match.baseToleranceM[mode] + Math.min(accuracyM, N.maxTrustedAccuracyM);
}

/** Advances only past maneuver point + margin; moves back only when the position was re-acquired. */
export function stepForAlong(
  route: NavRoute,
  alongM: number,
  current: number,
  marginM: number,
  allowBack: boolean,
) {
  let i = Math.min(current, route.steps.length - 1);
  if (allowBack) while (i > 0 && alongM < route.steps[i]!.startM) i--;
  while (i + 1 < route.steps.length && alongM >= route.steps[i + 1]!.startM + marginM) i++;
  return i;
}

export function computeProgress(route: NavRoute, alongM: number, stepIndex: number): Progress {
  const steps = route.steps;
  const step = steps[stepIndex]!;
  const next = steps[stepIndex + 1];
  const maneuverAt = next ? next.startM : route.lengthM;
  const departing = stepIndex === 0 && alongM - step.startM < N.step.departShowM;
  const remainingM = Math.max(0, route.lengthM - alongM);
  let remainingSec: number;
  if (route.staticTotalSec > 0) {
    const span = step.endM - step.startM;
    const within = span > 0 ? Math.max(0, Math.min(1, (step.endM - alongM) / span)) : 0;
    let rem = step.durationSec * within;
    for (let k = stepIndex + 1; k < steps.length; k++) rem += steps[k]!.durationSec;
    // Scale static step durations to the (traffic-aware) route duration.
    remainingSec = (route.durationSec * rem) / route.staticTotalSec;
  } else {
    remainingSec = route.lengthM > 0 ? (route.durationSec * remainingM) / route.lengthM : 0;
  }
  return {
    alongM,
    stepIndex,
    remainingM,
    remainingSec: Math.max(0, Math.round(remainingSec)),
    distanceToManeuverM: Math.max(0, maneuverAt - alongM),
    primary: departing ? step : (next ?? "arrive"),
    then: departing ? (next ?? "arrive") : next ? (steps[stepIndex + 2] ?? "arrive") : null,
    departing,
  };
}

/**
 * Pure GPS → route matcher. Each reading is weighed by its accuracy:
 * - ignored (> ignoreAccuracyM) or implausible jumps never change state;
 * - weak readings move the marker but never advance steps or count toward off-route;
 * - good readings inside the corridor update progress; outside it they count toward off-route.
 */
export function updateTracker(
  route: NavRoute,
  state: TrackerState,
  fix: Fix,
  mode: TravelMode,
): TrackResult {
  const p = { lat: fix.lat, lng: fix.lng };
  const t = fix.timestamp;
  const dt = state.last ? Math.max(0, (t - state.last.t) / 1000) : 0;
  const jump = state.last ? distanceM(state.last.p, p) : 0;
  let quality: FixQuality =
    fix.accuracyM > N.ignoreAccuracyM
      ? "ignored"
      : fix.accuracyM > N.maxTrustedAccuracyM
        ? "weak"
        : "good";
  if (quality === "weak" && dt > 0 && jump / dt > N.maxSpeedMps[mode]) quality = "ignored";
  const heldProgress =
    state.alongM !== null ? computeProgress(route, state.alongM, state.stepIndex) : null;
  const validHeading =
    fix.headingDeg !== null && Number.isFinite(fix.headingDeg) && (fix.speedMps ?? 0) > 1
      ? fix.headingDeg
      : null;

  if (quality === "ignored")
    return {
      state,
      quality,
      onRoute: false,
      lateralM: null,
      displayPoint: p,
      headingDeg: validHeading,
      offRoute: false,
      arrived: false,
      progress: heldProgress,
    };

  const tol = toleranceM(mode, fix.accuracyM);
  let proj: Projection | null = null;
  let reacquired = state.alongM === null;
  if (state.alongM !== null) {
    const speed = fix.speedMps ?? (dt > 0 ? jump / dt : 0);
    const ahead = Math.max(
      N.match.windowAheadMinM,
      speed * dt * N.match.windowAheadSpeedFactor + fix.accuracyM,
    );
    proj = projectOnPath(route, p, state.alongM - N.match.windowBackM, state.alongM + ahead);
  }
  if (!proj || proj.distanceM > tol) {
    // Re-acquire anywhere on the route (e.g. after a shortcut back onto it).
    const global = projectOnPath(route, p);
    if (global && (global.distanceM <= tol || !proj)) {
      proj = global;
      reacquired = true;
    }
  }
  const lateralM = proj?.distanceM ?? null;
  const inside = lateralM !== null && lateralM <= tol;
  const onRoute = inside && quality === "good";

  let { alongM, stepIndex, offRouteCount, offRouteSince } = state;
  if (onRoute && proj) {
    let a = proj.alongM;
    if (alongM !== null && !reacquired && a < alongM && alongM - a < N.match.backwardJitterM)
      a = alongM;
    alongM = a;
    stepIndex = stepForAlong(route, a, stepIndex, N.step.advanceMarginM[mode], reacquired);
  }
  if (quality === "good") {
    if (inside) {
      offRouteCount = 0;
      offRouteSince = null;
    } else {
      offRouteCount += 1;
      offRouteSince ??= t;
    }
  }
  const offRoute =
    offRouteCount >= N.offRoute.consecutiveReadings &&
    offRouteSince !== null &&
    t - offRouteSince >= N.offRoute.minDurationMs;

  const radius = N.arrival.radiusM[mode];
  const direct = distanceM(p, route.destination);
  const remaining = alongM !== null ? route.lengthM - alongM : Number.POSITIVE_INFINITY;
  const near =
    quality === "good" &&
    (direct <= radius + Math.min(fix.accuracyM, 30) * 0.5 || (onRoute && remaining <= radius));
  const arrivalCount = near ? state.arrivalCount + 1 : 0;
  const arrived =
    near &&
    (arrivalCount >= N.arrival.consecutiveReadings ||
      (fix.accuracyM <= N.arrival.instantAccuracyM && direct <= radius));

  const next: TrackerState = {
    alongM,
    stepIndex,
    offRouteCount,
    offRouteSince,
    arrivalCount,
    last: { p, t },
  };
  return {
    state: next,
    quality,
    onRoute,
    lateralM,
    displayPoint: onRoute && alongM !== null ? pointAlong(route, alongM) : p,
    headingDeg: validHeading ?? (onRoute && alongM !== null ? bearingAlong(route, alongM) : null),
    offRoute,
    arrived,
    progress: alongM !== null ? computeProgress(route, alongM, stepIndex) : null,
  };
}
