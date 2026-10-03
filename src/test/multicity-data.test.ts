import { afterEach, describe, expect, it, vi } from "vitest";
import nycAsset from "../../public/data/nyc.json";
import chicagoAsset from "../../public/data/chicago.json";
import sfAsset from "../../public/data/san-francisco.json";
import londonAsset from "../../public/data/london.json";
import { validateRiskGrid } from "@/services/riskDataService";
import { cellKey, hasExposureComparison, recommend, scoreRoute } from "@/services/exposureService";
import type { CandidateRoute } from "@/types/route";

const nyc = validateRiskGrid(nycAsset, "nyc");
// Frozen Brisa source cell 14:28 center, independently obtained from its package.
const center = { lat: 40.75726733740568, lng: -73.98591373172748 };
const covered: CandidateRoute = {
  id: "times-square",
  source: "google",
  distanceMeters: 80,
  durationSec: 70,
  path: [center, { lat: center.lat + 0.0007, lng: center.lng }],
};
const outside: CandidateRoute = {
  ...covered,
  id: "leaves-area",
  durationSec: 80,
  path: [center, { lat: 40.79, lng: center.lng }, center],
};

describe("real multicity aggregate data", () => {
  it.each([
    ["nyc", nycAsset, [-74.02, 40.7, -73.965, 40.78]],
    ["chicago", chicagoAsset, [-87.644, 41.866, -87.617, 41.891]],
    ["san-francisco", sfAsset, [-122.426, 37.773, -122.389, 37.803]],
    ["london", londonAsset, [-0.155, 51.495, -0.085, 51.535]],
  ] as const)(
    "validates %s as actual walking data with documented coverage",
    (id, asset, bounds) => {
      const grid = validateRiskGrid(asset, id);
      expect(grid.meta.cityId).toBe(id);
      expect(grid.meta.modes).toEqual(["walking"]);
      expect(grid.meta.coverageBounds).toEqual(bounds);
      expect(grid.isDemo).toBe(false);
      expect(grid.meta.incidentsUsed).toBeGreaterThan(0);
    },
  );

  it("maps a real NYC source coordinate to its exact original intensity", () => {
    expect(cellKey(nyc, center.lat, center.lng)).toBe("28_14");
    expect(nyc.cells["28_14"]!.walking).toEqual([
      0.8472494682372725, 0.713138138395074, 0.7851563824194946, 0.8862015931139076,
    ]);
    const score = scoreRoute(covered, nyc, "walking", 20);
    expect(score.coverage).toBe("covered");
    expect(score.exposure).toBeGreaterThan(0);
    expect(score.exposure).toBeLessThan(100); // Preserves normalized values; display scale must not alter scoring.
  });

  it("withholds exposure comparison when a route exits and reenters the planning area", () => {
    const score = scoreRoute(outside, nyc, "walking", 20);
    expect(score.coverage).toBe("outside-coverage");
    expect(score.hotspots).toEqual([]);
    const result = recommend([covered, outside], nyc, "walking", 20, 5)!;
    expect(result.reason).toBe("outside-coverage");
    expect(result.recommended.id).toBe(covered.id);
    expect(result.improvement).toBe(0);
    expect(hasExposureComparison(result)).toBe(false);
  });

  it("does not treat compatibility driving arrays as supported observations", () => {
    expect(scoreRoute(covered, nyc, "driving", 12).coverage).toBe("unsupported-mode");
    const result = recommend([covered], nyc, "driving", 12, 5)!;
    expect(result.reason).toBe("unsupported-mode");
    expect(hasExposureComparison(result)).toBe(false);
  });

  it("keeps routing available without an incident dataset or exposure claim", () => {
    const result = recommend([covered, outside], null, "walking", 12, 5)!;
    expect(result.reason).toBe("unavailable");
    expect(result.recommended.id).toBe(covered.id);
    expect(hasExposureComparison(result)).toBe(false);
  });

  it("keeps London's all-day exposure invariant across all departure hours", () => {
    const london = validateRiskGrid(londonAsset, "london");
    const route: CandidateRoute = {
      ...covered,
      path: [
        { lat: 51.513, lng: -0.13 },
        { lat: 51.514, lng: -0.129 },
      ],
    };
    expect(london.meta.timeResolution).toBe("all-day");
    const baseline = scoreRoute(route, london, "walking", 0);
    expect(baseline.coverage).toBe("covered");
    expect(baseline.exposure).toBeGreaterThan(0);
    for (let hour = 1; hour < 24; hour++) {
      expect(scoreRoute(route, london, "walking", hour).exposure).toBe(baseline.exposure);
    }
  });

  it("rejects a dataset associated with a different city", () => {
    expect(() => validateRiskGrid(nycAsset, "chicago")).toThrow();
  });

  it("rejects negative activity instead of accepting a corrupt dataset", () => {
    const corrupt = structuredClone(nycAsset);
    corrupt.cells["0_0"].walking[0] = -1;
    expect(() => validateRiskGrid(corrupt, "nyc")).toThrow();
  });
});

describe("reject malformed coverage data", () => {
  it("rejects positive incident totals with no grid observations", () => {
    expect(() => validateRiskGrid({ ...nycAsset, cells: {} }, "nyc")).toThrow();
  });

  it("rejects documented coverage extending beyond its backing grid", () => {
    const corrupt = structuredClone(nycAsset);
    corrupt.meta.coverageBounds = [-75, 40, -73, 41];
    expect(() => validateRiskGrid(corrupt, "nyc")).toThrow();
  });
});

describe("runtime incident dataset loading", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function freshLoader() {
    vi.resetModules();
    const { loadRiskGrid } = await import("@/services/riskDataService");
    const { CITIES } = await import("@/config/cities");
    return { loadRiskGrid, city: (id: string) => CITIES.find((city) => city.id === id)! };
  }

  it("does not fetch for cities with no incident dataset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { loadRiskGrid, city } = await freshLoader();
    await expect(loadRiskGrid(city("lima"))).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries after a failed load instead of caching rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => nycAsset });
    vi.stubGlobal("fetch", fetchMock);
    const { loadRiskGrid, city } = await freshLoader();
    await expect(loadRiskGrid(city("nyc"))).rejects.toThrow();
    await expect(loadRiskGrid(city("nyc"))).resolves.toMatchObject({ meta: { cityId: "nyc" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares repeated city requests without crossing city datasets", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === "/data/nyc.json" ? nycAsset : chicagoAsset),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { loadRiskGrid, city } = await freshLoader();
    const first = loadRiskGrid(city("nyc"));
    expect(loadRiskGrid(city("nyc"))).toBe(first);
    const second = loadRiskGrid(city("chicago"));
    expect(second).not.toBe(first);
    const [ny, chicago] = await Promise.all([first, second]);
    expect(ny?.meta.cityId).toBe("nyc");
    expect(chicago?.meta.cityId).toBe("chicago");
    expect(loadRiskGrid(city("nyc"))).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/data/nyc.json");
    expect(fetchMock).toHaveBeenCalledWith("/data/chicago.json");
  });
});
