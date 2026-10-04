import type { TravelMode } from "@/types/risk";

/**
 * In-app navigation thresholds. Exposure scoring stays in exposureConfig.ts; these values only
 * control how live GPS readings are matched to the Arazul-selected route.
 * Accuracy values are the browser's 68% confidence radius (GeolocationCoordinates.accuracy).
 */
export const NAVIGATION_CONFIG = {
  /** maximumAge 0: never accept a cached reading (it could be from before this trip started). */
  geolocation: { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  /** Readings worse than this are drawn as "weak GPS" but never move progress or count off-route. */
  maxTrustedAccuracyM: 50,
  /** Readings worse than this are ignored for matching entirely (cell-tower / Wi-Fi guesses). */
  ignoreAccuracyM: 150,
  /** No reading for this long shows "GPS signal lost" (the watch keeps running). */
  signalLostMs: 15000,
  /** Fastest plausible movement; faster single jumps with poor accuracy are treated as noise. */
  maxSpeedMps: { walking: 8, driving: 60 } satisfies Record<TravelMode, number>,
  match: {
    /** On-route corridor = base + min(accuracy, maxTrustedAccuracyM). */
    baseToleranceM: { walking: 25, driving: 40 } satisfies Record<TravelMode, number>,
    /** Progress search window around the last matched position (prevents jumping to a
     * parallel/returning part of the same route). */
    windowBackM: 40,
    windowAheadMinM: 150,
    windowAheadSpeedFactor: 3,
    /** Small backward projections are GPS jitter, not the user walking back. */
    backwardJitterM: 15,
  },
  step: {
    /** Advance to the next instruction only once matched this far past the maneuver point. */
    advanceMarginM: { walking: 8, driving: 15 } satisfies Record<TravelMode, number>,
    /** Show the departure instruction ("Head north on…") until this far into step 0. */
    departShowM: 20,
  },
  offRoute: {
    /** Consecutive trusted readings outside the corridor before rerouting… */
    consecutiveReadings: 3,
    /** …spanning at least this long, so a burst of bad fixes cannot trigger a reroute. */
    minDurationMs: 6000,
  },
  reroute: {
    /** Minimum time between Google reroute requests; doubles after each failure. */
    cooldownMs: 30000,
    maxCooldownMs: 120000,
    /** Hard cap on automatic reroutes per navigation session (API cost guard). */
    maxPerSession: 12,
    /** Rejoin point placed this far ahead on the previous route when preserving it. */
    rejoinAheadM: { walking: 120, driving: 350 } satisfies Record<TravelMode, number>,
    /** Within this distance of the end, the destination itself is the rejoin point. */
    finalApproachM: { walking: 40, driving: 80 } satisfies Record<TravelMode, number>,
    /** Manual "Recalculate": its own spacing and a small allowance beyond the automatic cap. */
    manualCooldownMs: 20000,
    manualMaxPerSession: 3,
  },
  /**
   * Routes without Google steps: one request through this many via points taken from Arazul's
   * geometry (kept ≤ 10: more intermediates move Routes API requests to a higher billing tier),
   * accepted only if Google's path stays within this mean deviation of Arazul's.
   */
  stepsFallback: { viaPoints: 8, maxMeanDeviationM: 35 },
  /** If the first trusted fix is farther than this from the route, plan from the device location. */
  startJoinM: { walking: 60, driving: 120 } satisfies Record<TravelMode, number>,
  arrival: {
    radiusM: { walking: 25, driving: 40 } satisfies Record<TravelMode, number>,
    consecutiveReadings: 2,
    /** A single reading this accurate inside the radius confirms arrival immediately. */
    instantAccuracyM: 15,
  },
  camera: {
    zoom: { walking: 18, driving: 17 } satisfies Record<TravelMode, number>,
    /** Camera centers between the user and this far ahead so upcoming geometry stays visible. */
    lookAheadM: { walking: 40, driving: 120 } satisfies Record<TravelMode, number>,
  },
  /** Spoken prompts before a maneuver (meters); the last one is the "now" prompt. */
  voiceAtM: { walking: [120, 20], driving: [700, 220, 40] } satisfies Record<
    TravelMode,
    readonly number[]
  >,
} as const;
