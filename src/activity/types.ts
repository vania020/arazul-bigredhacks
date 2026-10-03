export type LngLat = [number, number];
export type Bounds = [number, number, number, number];
export interface CoverageArea {
  id: string;
  cityId: string;
  bounds: Bounds;
}
export interface IncidentCell {
  id: string;
  center: LngLat;
  bounds: Bounds;
  counts?: number[];
  weighted?: number[];
  intensity?: number[];
  total?: number;
}
