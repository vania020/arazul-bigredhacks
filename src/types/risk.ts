export type TravelMode = "walking" | "driving";

export interface RiskGridMeta {
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
}
