import { describe, expect, it } from "vitest";
import { compareTimeWindows, TIME_WINDOWS } from "@/services/time-of-day";
import { EXPOSURE_CONFIG } from "@/config/exposureConfig";
import { scoreRoute } from "@/services/exposureService";
import type { RiskGrid } from "@/types/risk";
import type { CandidateRoute } from "@/types/route";
const route: CandidateRoute = {
  id: "fixed",
  source: "google",
  path: [
    { lat: 0.001, lng: 0.001 },
    { lat: 0.002, lng: 0.002 },
  ],
  distanceMeters: 157,
  durationSec: 120,
};
function grid(values = [10, 20, 30, 40]): RiskGrid {
  return {
    isDemo: false,
    meta: {
      cellSizeM: 1000,
      originLat: 0,
      originLon: 0,
      rows: 1,
      cols: 1,
      buckets: ["0", "6", "12", "18"],
      modes: ["walking"],
      source: "fixture",
      period: "historical",
      incidentsUsed: 100,
      timeResolution: "six-hour",
    },
    cells: { "0_0": { walking: values, driving: values } },
  };
}
describe("historical windows on a fixed route", () => {
  it("scores the same geometry and changes only the bucket", () => {
    const data = grid();
    const original = structuredClone(route);
    const result = compareTimeWindows(route, data, "walking", 7);
    expect(result.status).toBe("available");
    expect(result.windows.map((w) => w.index)).toEqual(
      TIME_WINDOWS.map(
        (h) =>
          Math.round(
            (scoreRoute(route, data, "walking", h).exposure / EXPOSURE_CONFIG.displayDivisor) * 100,
          ) / 100,
      ),
    );
    expect(new Set(result.windows.map((w) => w.index)).size).toBeGreaterThan(1);
    expect(result.windows[1]!.difference).toBe(0);
    expect(result.windows[0]!.difference).toBeLessThan(0);
    expect(route).toEqual(original);
    expect(compareTimeWindows(route, data, "walking", 11)).toEqual(result);
    expect(compareTimeWindows(route, data, "walking", 12).currentBucket).toBe(2);
  });
  it("shows decimal differences and raw bar contrast hidden by whole-number indexes", () => {
    const data = grid([5, 6, 7, 8]);
    const raw = TIME_WINDOWS.map((h) => scoreRoute(route, data, "walking", h));
    expect(new Set(raw.map((s) => s.index)).size).toBe(1);
    const result = compareTimeWindows(route, data, "walking", 0);
    expect(new Set(result.windows.map((w) => w.index)).size).toBe(4);
    expect(result.windows[0]!.difference).toBe(0);
    expect(result.windows[3]!.difference).toBeGreaterThan(0);
    expect(result.windows[0]!.relativeBar).toBeCloseTo(raw[0]!.exposure / raw[3]!.exposure, 12);
    expect(result.windows[3]!.relativeBar).toBe(1);
  });
  it("keeps ties equal and handles a zero baseline without division", () => {
    const tied = compareTimeWindows(route, grid([20, 20, 20, 20]), "walking", 0);
    expect(tied.windows.every((w) => w.relativeBar === 1 && w.difference === 0)).toBe(true);
    const zero = compareTimeWindows(route, grid([0, 0, 0, 0]), "walking", 0);
    expect(
      zero.windows.every((w) => w.relativeBar === 0 && w.index === 0 && w.difference === 0),
    ).toBe(true);
  });
  it("allows choosing a bucket before a route without inventing scores", () => {
    expect(compareTimeWindows(null, grid(), "walking", 18)).toEqual({
      status: "choose-route",
      windows: [],
      currentBucket: 3,
    });
  });
  it("does not generate comparisons for absent, all-day, unsupported or uncovered data", () => {
    const allDay = grid();
    allDay.meta.timeResolution = "all-day";
    const unknown = grid();
    delete unknown.meta.timeResolution;
    const demo = grid();
    demo.isDemo = true;
    const outside = {
      ...route,
      path: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
    };
    const results = [
      compareTimeWindows(route, null, "walking", 0),
      compareTimeWindows(route, allDay, "walking", 0),
      compareTimeWindows(route, grid(), "driving", 0),
      compareTimeWindows(outside, grid(), "walking", 0),
      compareTimeWindows(route, unknown, "walking", 0),
      compareTimeWindows(route, demo, "walking", 0),
    ];
    expect(results.map((r) => r.status)).toEqual([
      "unavailable",
      "all-day",
      "unsupported-mode",
      "outside-coverage",
      "unavailable",
      "unavailable",
    ]);
    expect(results.every((r) => r.windows.length === 0)).toBe(true);
  });
});
