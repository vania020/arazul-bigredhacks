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
  },
  extraTime: { min: 0, max: 15, default: 5 },
  layer: { minZoom: 13, minValue: 1, opacity: 0.22 },
  timeZone: "America/Sao_Paulo",
  searchCenter: { lat: -23.5505, lng: -46.6333 },
  searchRadiusM: 50000,
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
  { category: "Homicide / Robbery-homicide / Attempted homicide", severity: 5, walking: 1.0, driving: 1.0 },
  { category: "Robbery (street/other)", severity: 4, walking: 1.0, driving: 0.6 },
  { category: "Vehicle robbery", severity: 4, walking: 0.2, driving: 1.0 },
  { category: "Cargo robbery", severity: 4, walking: 0.0, driving: 0.3 },
  { category: "Assault", severity: 3, walking: 1.0, driving: 0.5 },
  { category: "Theft (street/other)", severity: 2, walking: 0.8, driving: 0.3 },
  { category: "Vehicle theft", severity: 2, walking: 0.1, driving: 0.9 },
];
