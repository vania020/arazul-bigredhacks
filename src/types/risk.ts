import type { CoverageGeoJSON } from "@/services/nycCoverage";

export type TravelMode = "walking" | "driving";

export interface RiskGridMeta {
  cityId?: string;
  sourceUrl?: string;
  methodology?: string;
  limitations?: string[];
  coverageBounds?: [number, number, number, number];
  /** Polygon mask served next to the grid; required when requiresPolygonCoverageGuard is set. */
  coverageGeojsonUrl?: string;
  /**
   * The bounding rectangle includes uncovered land (e.g. New Jersey around NYC): routes must lie
   * inside the polygon mask and every grid cell must be serialized, including zero cells.
   */
  requiresPolygonCoverageGuard?: boolean;
  projectionLatitude?: number;
  timeResolution?: "six-hour" | "all-day";
  displayScale?: number;
  cellSizeM: number;
  originLat: number;
  originLon: number;
  rows: number;
  cols: number;
  buckets: string[];
  modes: TravelMode[];
  source: string;
  period: string;
  incidentsUsed: number;
  scaleP99?: number;
  note?: string;
  timezone?: string;
  dataAsOf?: string;
  sourceModelVersion?: string;
  sourceReportCount?: number;
  excludedReportCount?: number;
  /** Source audit fields; kept as published (unknown keys preserved). */
  provenance?: Record<string, unknown>;
}

export interface RiskCell {
  walking: number[];
  driving: number[];
  top?: Partial<Record<TravelMode, string[]>>;
}

export interface RiskGrid {
  meta: RiskGridMeta;
  cells: Record<string, RiskCell>;
  /** true when the synthetic fallback grid is in use (never SSP data). */
  isDemo: boolean;
  /** Runtime-only: validated polygon mask fetched from meta.coverageGeojsonUrl. Never serialized. */
  coverageGeometry?: CoverageGeoJSON;
}
