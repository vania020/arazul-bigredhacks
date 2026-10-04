import { readFileSync } from "node:fs";
import path from "node:path";
import { attachCoverageGeometry, validateRiskGrid } from "@/services/riskDataService";
import type { RiskGrid } from "@/types/risk";
import type { CandidateRoute, LatLng } from "@/types/route";

// Read (not imported) so TypeScript does not infer a literal type for the 3 MB grid.
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../../public/data", file), "utf8");
export const nycNativeText = read("nyc-native.json");
export const nycCoverageText = read("nyc-coverage.geojson");
export const nycNativeAsset = () => JSON.parse(nycNativeText) as RiskGrid;
export const nycCoverageAsset = () => JSON.parse(nycCoverageText) as unknown;

let active: RiskGrid | null = null;
/** The active NYC grid exactly as loadRiskGrid assembles it (grid + validated polygon mask). */
export function nycNative() {
  return (active ??= attachCoverageGeometry(
    validateRiskGrid(nycNativeAsset(), "nyc"),
    nycCoverageAsset(),
  ));
}

export const route = (id: string, path: LatLng[], durationSec = 600): CandidateRoute => ({
  id,
  source: "google",
  distanceMeters: 1000,
  durationSec,
  path,
});
