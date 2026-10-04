import type { IncidentCategoryWeight } from "@/types/incident";

/** All ARAZUL scoring weights, thresholds and constants live here. */
export const EXPOSURE_CONFIG = {
  sampleSpacingM: 30,
  currentBucketWeight: 0.7,
  averageBucketWeight: 0.3,
  displayDivisor: 1000,
  minImprovement: 0.15,
  hotspotPercentile: 0.85,
  hotspotMinSamples: 3,
  detour: {
    maxHotspots: 3,
    offsetsM: [220, -220], // perpendicular offsets, one per side (150-300 m band)
    maxRequests: 6,
    concurrency: 3,
    duplicateMeanDistanceM: 45,
    /** Routes sharing at least this much geometry (both ways, within duplicateMeanDistanceM)
     * are the same corridor: only the first is kept. */
    duplicateOverlap: 0.92,
  },
  /**
   * Region-aware bypass generation (uses the same detour.maxRequests budget). Thresholds are
   * dataset-relative and distances derive from the dataset's own cell size, the trip's own speed
   * and the extra-time cap, so they adapt to each city's grid and to walking vs driving.
   */
  corridor: {
    /** A cell is "high exposure" at or above this quantile of the dataset's non-zero cells. */
    highQuantile: 0.85,
    /** High stretches closer than this along the route belong to one crossing. */
    mergeGapM: { walking: 250, driving: 600 },
    /** Only crossings holding at least this share of the route's exposure get bypasses. */
    minShare: 0.06,
    maxCrossings: 2,
    /** Regions of at most this many connected cells are "isolated hotspots". */
    isolatedMaxCells: 4,
    maxRegionCells: 20000,
    /** Corridor search starts/ends this many cells before/after the crossing. */
    entryMarginCells: 2,
    /** Distance penalty per metre, as multiples of the dataset's high threshold:
     * 1 = balanced corridor, 0.25 = wider corridor that accepts more distance. */
    lambdaFactors: [1, 0.25],
    maxLateralM: { walking: 900, driving: 3000 },
    maxWindowCells: 60000,
    /** One via waypoint per this much corridor length (1–maxWaypoints). */
    waypointSpacingM: { walking: 700, driving: 2000 },
    maxWaypoints: 3,
    /** Skip corridors estimated to save less than this share of the route's exposure. */
    minEstimatedGain: 0.04,
    /** First-round requests (parallel); the rest of maxRequests goes to the next corridors. */
    firstRound: 4,
    /** Real streets are longer than a grid path between the same points (urban circuity). */
    circuity: 1.3,
  },
  extraTime: { min: 0, max: 15, default: 5 },
  /**
   * Lower-exposure routes shown (never recommended) when they exceed the user's extra-time
   * budget but stay within extraTime.max. "Meaningful" reuses minImprovement vs the fastest
   * route; the option must also beat the current recommendation by minGainOverRecommended.
   */
  outsideBudget: {
    minGainOverRecommended: 0.05,
    /** Options within this many percentage points of the best: prefer the faster one. */
    tieImprovementPts: 3,
    /** One featured option plus up to two under "more options". */
    maxShown: 3,
  },
  layer: { minZoom: 0, minValue: 1, minOpacity: 0.28, opacity: 0.45, routeOpacity: 0.55 },
  /** Bucket index boundaries: madrugada 0-6, manha 6-12, tarde 12-18, noite 18-24. */
  bucketForHour: (h: number) => (h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3),
} as const;

/** Exposure color scale thresholds on per-cell values (upper bounds). CSS var names map to tokens. */
export const EXPOSURE_SCALE = [
  { max: 2, cssVar: "--exp-1", key: "lower" },
  { max: 5, cssVar: "--exp-2", key: "lowModerate" },
  { max: 10, cssVar: "--exp-3", key: "moderate" },
  { max: 16, cssVar: "--exp-4", key: "elevated" },
  { max: 24, cssVar: "--exp-5", key: "high" },
  { max: Infinity, cssVar: "--exp-6", key: "veryHigh" },
] as const;

/** Read-only, already applied inside risk-grid.json. Shown in the MethodologyModal only. */
export const CATEGORY_WEIGHTS: IncidentCategoryWeight[] = [
  {
    category: "Homicide / Robbery-homicide / Attempted homicide",
    severity: 5,
    walking: 1.0,
    driving: 1.0,
  },
  { category: "Robbery (street/other)", severity: 4, walking: 1.0, driving: 0.6 },
  { category: "Vehicle robbery", severity: 4, walking: 0.2, driving: 1.0 },
  { category: "Cargo robbery", severity: 4, walking: 0.0, driving: 0.3 },
  { category: "Assault", severity: 3, walking: 1.0, driving: 0.5 },
  { category: "Theft (street/other)", severity: 2, walking: 0.8, driving: 0.3 },
  { category: "Vehicle theft", severity: 2, walking: 0.1, driving: 0.9 },
];
