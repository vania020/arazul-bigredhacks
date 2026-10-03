import type { TravelMode } from "./risk";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationValue {
  label: string;
  latLng?: LatLng;
}

export interface CandidateRoute {
  id: string;
  source: "google" | "detour";
  path: LatLng[];
  distanceMeters: number;
  durationSec: number;
  via?: LatLng[];
}

export interface Hotspot {
  startIdx: number;
  endIdx: number;
  lengthM: number;
  exposure: number;
  midpoint: LatLng;
  bearingPoint: LatLng; // a neighbouring sample, used to compute direction
}

export interface ScoredRoute extends CandidateRoute {
  coverage: "covered" | "outside-coverage" | "unsupported-mode" | "unavailable";
  exposure: number; // unrounded sum(cellValue * spacing)
  index: number; // displayed round(exposure / 1000)
  hotspots: Hotspot[];
  hotspotMeters: number;
  contributors: Record<string, number>; // meters per dominant category
}

export type RecommendationReason =
  | "improved"
  | "not-meaningful"
  | "no-alternative"
  | "unavailable"
  | "outside-coverage"
  | "unsupported-mode";

export interface Recommendation {
  fastest: ScoredRoute;
  recommended: ScoredRoute;
  eligible: ScoredRoute[];
  reason: RecommendationReason;
  improvement: number; // 0..1, from unrounded totals
  extraMin: number;
}

export interface SearchRequest {
  origin: LocationValue;
  destination: LocationValue;
  mode: TravelMode;
  departureHour: number | null; // null = now
}
