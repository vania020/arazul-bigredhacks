import { EXPOSURE_CONFIG } from "@/config/exposureConfig";
import { routeCoverage, scoreRoute } from "@/services/exposureService";
import type { CandidateRoute } from "@/types/route";
import type { RiskGrid, TravelMode } from "@/types/risk";
export const TIME_WINDOWS = [0, 6, 12, 18] as const;
export type TimeComparisonStatus =
  | "available"
  | "choose-route"
  | "all-day"
  | "unavailable"
  | "unsupported-mode"
  | "outside-coverage";
export interface TimeWindowScore {
  hour: number;
  index: number;
  relativeBar: number;
  difference: number;
}
export function compareTimeWindows(
  route: CandidateRoute | null,
  grid: RiskGrid | null,
  mode: TravelMode,
  hour: number,
): { status: TimeComparisonStatus; windows: TimeWindowScore[]; currentBucket: number } {
  const currentBucket = EXPOSURE_CONFIG.bucketForHour(hour);
  const empty = (status: TimeComparisonStatus) => ({ status, windows: [], currentBucket });
  if (!grid || grid.isDemo) return empty("unavailable");
  if (grid.meta.timeResolution === "all-day") return empty("all-day");
  if (grid.meta.timeResolution !== "six-hour") return empty("unavailable");
  if (!grid.meta.modes.includes(mode)) return empty("unsupported-mode");
  if (!route) return empty("choose-route");
  const coverage = routeCoverage(route, grid, mode);
  if (coverage !== "covered") return empty(coverage);
  // Only the bucket changes; the selected route geometry remains identical.
  const scores = TIME_WINDOWS.map((start) => scoreRoute(route, grid, mode, start));
  const maxExposure = Math.max(...scores.map((score) => score.exposure));
  const baseline = scores[currentBucket]!.exposure;
  const displayIndex = (exposure: number) =>
    Math.round((exposure / EXPOSURE_CONFIG.displayDivisor) * 100) / 100;
  return {
    status: "available",
    currentBucket,
    windows: scores.map((score, i) => ({
      hour: TIME_WINDOWS[i]!,
      index: displayIndex(score.exposure),
      relativeBar: maxExposure > 0 ? score.exposure / maxExposure : 0,
      difference: displayIndex(score.exposure - baseline),
    })),
  };
}
