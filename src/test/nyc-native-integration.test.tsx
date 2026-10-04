import { createHash } from "node:crypto";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import chicagoAsset from "../../public/data/chicago.json";
import sfAsset from "../../public/data/san-francisco.json";
import londonAsset from "../../public/data/london.json";
import { CITIES } from "@/config/cities";
import { EXPOSURE_CONFIG } from "@/config/exposureConfig";
import { MethodologyModal } from "@/components/MethodologyModal";
import { nycSourceFacts } from "@/services/nycSourceFacts";
import { I18nProvider } from "@/i18n";
import {
  blendedValue,
  cellKey,
  hasExposureComparison,
  recommend,
  routeCoverage,
  scoreRoute,
} from "@/services/exposureService";
import { samplePath } from "@/services/geo";
import { isPointInsideCoverage } from "@/services/nycCoverage";
import { attachCoverageGeometry, validateRiskGrid } from "@/services/riskDataService";
import { currentHourIn } from "@/services/routingService";
import { compareTimeWindows } from "@/services/time-of-day";
import type { RiskGrid } from "@/types/risk";
import type { LatLng } from "@/types/route";
import { nycCoverageAsset, nycNative, nycNativeAsset, nycNativeText, route } from "./nycFixtures";

const ll = (lat: number, lng: number): LatLng => ({ lat, lng });
const BOROUGH_ROUTES: [string, LatLng[]][] = [
  ["Manhattan", [ll(40.7510909, -73.9933748), ll(40.7522481, -73.9775815)]],
  ["Bronx", [ll(40.827, -73.9229), ll(40.829, -73.921)]],
  ["Brooklyn", [ll(40.6782, -73.9442), ll(40.68, -73.942)]],
  ["Queens", [ll(40.7282, -73.7949), ll(40.73, -73.793)]],
  ["Staten Island", [ll(40.5795, -74.1502), ll(40.581, -74.148)]],
];
const JERSEY_CITY = [ll(40.7178, -74.0431), ll(40.7195, -74.045)];
const HOLLAND_TUNNEL_TO_NJ = [ll(40.7262, -74.0094), ll(40.7275, -74.036)];
// One straight segment from Staten Island to the Battery: both ends in NYC, middle over Bayonne, NJ.
const ACROSS_BAYONNE = [ll(40.6, -74.17), ll(40.7033, -74.017)];

/** Small guarded grid near (0,0): 10×10 cells of ~0.001°, full serialization, square mask. */
function syntheticGuarded(value: (row: number) => number, hole?: number[][]) {
  const cells: RiskGrid["cells"] = {};
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      const v = value(r);
      cells[`${r}_${c}`] = { walking: [v, v, v, v], driving: [v, v, v, v] };
    }
  const grid = validateRiskGrid(
    {
      isDemo: false,
      cells,
      meta: {
        cellSizeM: 111.32,
        originLat: 0,
        originLon: 0,
        projectionLatitude: 0,
        rows: 10,
        cols: 10,
        coverageBounds: [0, 0, 0.01, 0.01],
        coverageGeojsonUrl: "/data/fixture.geojson",
        requiresPolygonCoverageGuard: true,
        buckets: ["0", "6", "12", "18"],
        modes: ["walking"],
        source: "fixture",
        period: "fixture",
        incidentsUsed: 1,
      },
    },
    "fixture",
  );
  const outer = [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
    [0, 0],
  ];
  return attachCoverageGeometry(grid, {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: hole ? [outer, hole] : [outer] },
      },
    ],
  });
}

describe("NYC-native activation", () => {
  it("points only NYC at the polygon-guarded five-borough asset and keeps other cities", () => {
    const byId = Object.fromEntries(CITIES.map((c) => [c.id, c]));
    expect(byId["nyc"]).toMatchObject({
      datasetUrl: "/data/nyc-native.json",
      region: "All five boroughs",
      timeZone: "America/New_York",
      defaultMode: "walking",
    });
    expect(byId["nyc"]!.demo.origin.label).toBe("Penn Station, Manhattan");
    expect(byId["nyc"]!.demo.destination.label).toBe("Grand Central Terminal, Manhattan");
    expect(byId["chicago"]!.datasetUrl).toBe("/data/chicago.json");
    expect(byId["san-francisco"]!.datasetUrl).toBe("/data/san-francisco.json");
    expect(byId["london"]!.datasetUrl).toBe("/data/london.json");
    expect(byId["sao-paulo"]!.datasetUrl).toBe("hosted-sao-paulo");
    expect(byId["lima"]!.datasetUrl).toBeNull();
  });

  it("declares walking only, the 40.7 projection and the converter's southwest origin", () => {
    const { meta } = nycNative();
    expect(meta.modes).toEqual(["walking"]);
    expect(meta.requiresPolygonCoverageGuard).toBe(true);
    expect(meta.coverageGeojsonUrl).toBe("/data/nyc-coverage.geojson");
    expect(meta.projectionLatitude).toBe(40.7);
    expect(meta.originLat).toBe(40.47063591044679);
    expect(meta.originLon).toBe(-74.2676341880779);
    expect([meta.rows, meta.cols, meta.cellSizeM]).toEqual([203, 195, 250]);
    expect(meta.displayScale).toBe(24);
  });

  it("indexes cells with the dataset projection, not Manhattan's old 40.74 or the map center", () => {
    const grid = nycNative();
    const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
    // Just east of column 180's western edge under the 40.7 projection (Queens).
    const lng = grid.meta.originLon + (180 * 250) / mLng(40.7) + 1e-7;
    const lat = 40.73;
    const row = Math.floor(((lat - grid.meta.originLat) * 111320) / 250);
    expect(cellKey(grid, lat, lng)).toBe(`${row}_180`);
    expect(Math.floor(((lng - grid.meta.originLon) * mLng(40.74)) / 250)).toBe(179);
  });

  it("keeps the published coverage file identical to the one the grid was built from", () => {
    const canonical = (v: unknown): string =>
      Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : v && typeof v === "object"
          ? `{${Object.keys(v)
              .sort()
              .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
              .join(",")}}`
          : JSON.stringify(v);
    const hash = createHash("sha256").update(canonical(nycCoverageAsset())).digest("hex");
    expect(hash).toBe(nycNative().meta.provenance!["coverageCanonicalSha256"]);
  });
});

describe("NYC polygon coverage in route scoring", () => {
  it.each(BOROUGH_ROUTES)("covers a %s walking route", (_name, path) => {
    const grid = nycNative();
    expect(routeCoverage(route("r", path), grid, "walking")).toBe("covered");
    expect(scoreRoute(route("r", path), grid, "walking", 12).coverage).toBe("covered");
  });

  it("covers a bridge segment inside NYC's water-inclusive boundary", () => {
    const bridge = [ll(40.7116, -74.0005), ll(40.7033, -73.9903)];
    expect(routeCoverage(route("bridge", bridge), nycNative(), "walking")).toBe("covered");
  });

  it.each([
    ["Jersey City", JERSEY_CITY],
    ["Manhattan to Jersey City", HOLLAND_TUNNEL_TO_NJ],
    ["a multi-point route through NJ", [ll(40.63, -74.16), ll(40.66, -74.23), ll(40.75, -74.0)]],
  ])("rejects %s although it lies inside the rectangular bounds", (_name, path) => {
    const grid = nycNative();
    const [w, s, e, n] = grid.meta.coverageBounds!;
    expect(path.every((p) => p.lng >= w && p.lng < e && p.lat >= s && p.lat < n)).toBe(true);
    expect(routeCoverage(route("nj", path), grid, "walking")).toBe("outside-coverage");
  });

  it("rejects one straight segment that crosses NJ between two covered NYC endpoints", () => {
    const grid = nycNative();
    for (const p of ACROSS_BAYONNE)
      expect(isPointInsideCoverage(p, grid.coverageGeometry!)).toBe(true);
    const score = scoreRoute(route("bayonne", ACROSS_BAYONNE), grid, "walking", 22);
    expect(score.coverage).toBe("outside-coverage");
    expect(score.exposure).toBe(0);
    expect(score.hotspots).toEqual([]);
  });

  it("withholds the whole comparison when any NYC candidate leaves coverage", () => {
    const grid = nycNative();
    const [manhattan] = BOROUGH_ROUTES;
    const result = recommend(
      [route("fast", manhattan![1], 600), route("nj", HOLLAND_TUNNEL_TO_NJ, 700)],
      grid,
      "walking",
      22,
      10,
    )!;
    expect(result.reason).toBe("outside-coverage");
    expect(result.recommended.id).toBe("fast");
    expect(hasExposureComparison(result)).toBe(false);
    expect(compareTimeWindows(route("nj", JERSEY_CITY), grid, "walking", 22).status).toBe(
      "outside-coverage",
    );
  });

  it("rejects a segment crossing an uncovered hole that no 30 m sample lands in", () => {
    const hole = [
      [0.0051, 0.002],
      [0.00511, 0.002],
      [0.00511, 0.008],
      [0.0051, 0.008],
      [0.0051, 0.002],
    ];
    const grid = syntheticGuarded(() => 0.5, hole);
    const path = [ll(0.005, 0.0015), ll(0.005, 0.0085)];
    const samples = samplePath(path, EXPOSURE_CONFIG.sampleSpacingM);
    expect(samples.every((s) => isPointInsideCoverage(s.p, grid.coverageGeometry!))).toBe(true);
    expect(routeCoverage(route("hole", path), grid, "walking")).toBe("outside-coverage");
    const beside = [ll(0.001, 0.0015), ll(0.001, 0.0085)];
    expect(routeCoverage(route("beside", beside), grid, "walking")).toBe("covered");
  });

  it("does not score NYC driving: compatibility arrays are not evidence", () => {
    const grid = nycNative();
    const path = BOROUGH_ROUTES[0]![1];
    expect(grid.cells[cellKey(grid, path[0]!.lat, path[0]!.lng)]!.driving).toBeDefined();
    expect(scoreRoute(route("car", path), grid, "driving", 12).coverage).toBe("unsupported-mode");
    const result = recommend([route("car", path)], grid, "driving", 12, 5)!;
    expect(result.reason).toBe("unsupported-mode");
    expect(hasExposureComparison(result)).toBe(false);
  });
});

describe("NYC boundary loading fails closed", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function freshLoader() {
    vi.resetModules();
    const { loadRiskGrid } = await import("@/services/riskDataService");
    const { CITIES: cities } = await import("@/config/cities");
    return { loadRiskGrid, nyc: cities.find((city) => city.id === "nyc")! };
  }
  const ok = (body: unknown) => ({ ok: true, json: async () => body });

  it("treats a guarded grid without its loaded mask as unavailable, never as zero exposure", () => {
    const grid = validateRiskGrid(nycNativeAsset(), "nyc");
    expect(grid.coverageGeometry).toBeUndefined();
    const path = BOROUGH_ROUTES[0]![1];
    const score = scoreRoute(route("r", path), grid, "walking", 12);
    expect(score.coverage).toBe("unavailable");
    const result = recommend([route("r", path)], grid, "walking", 12, 5)!;
    expect(result.reason).toBe("unavailable");
    expect(hasExposureComparison(result)).toBe(false);
  });

  it("rejects the NYC dataset when the boundary fetch fails, then retries both files", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(nycNativeAsset()))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(ok(nycNativeAsset()))
      .mockResolvedValueOnce(ok(nycCoverageAsset()));
    vi.stubGlobal("fetch", fetchMock);
    const { loadRiskGrid, nyc } = await freshLoader();
    await expect(loadRiskGrid(nyc)).rejects.toThrow("Coverage geometry HTTP 503");
    const grid = await loadRiskGrid(nyc);
    expect(grid?.coverageGeometry?.features).toHaveLength(5);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/data/nyc-native.json",
      "/data/nyc-coverage.geojson",
      "/data/nyc-native.json",
      "/data/nyc-coverage.geojson",
    ]);
    // Cached once: no further requests for the same city.
    await loadRiskGrid(nyc);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["malformed geometry", { type: "FeatureCollection", features: [] }],
    [
      "a mask that does not belong to the grid",
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-75, 40],
                  [-74, 40],
                  [-74, 41],
                  [-75, 40],
                ],
              ],
            },
          },
        ],
      },
    ],
  ])("rejects %s instead of loading an unguarded grid", async (_name, geometry) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ok(url.endsWith(".geojson") ? geometry : nycNativeAsset())),
    );
    const { loadRiskGrid, nyc } = await freshLoader();
    await expect(loadRiskGrid(nyc)).rejects.toThrow();
  });
});

describe("NYC full-grid completeness", () => {
  it("accepts legitimate all-zero cells", () => {
    const grid = nycNative();
    expect(grid.cells["0_0"]!.walking).toEqual([0, 0, 0, 0]);
    expect(Object.keys(grid.cells)).toHaveLength(203 * 195);
  });

  it.each([
    ["a missing cell", (g: RiskGrid) => delete g.cells["100_100"]],
    [
      "a renamed cell key",
      (g: RiskGrid) => {
        g.cells["0100_100"] = g.cells["100_100"]!;
        delete g.cells["100_100"];
      },
    ],
    ["a three-value array", (g: RiskGrid) => g.cells["5_5"]!.walking.pop()],
    [
      "a missing driving array",
      (g: RiskGrid) => {
        delete (g.cells["5_5"] as Partial<RiskGrid["cells"][string]>).driving;
      },
    ],
    ["a non-finite value", (g: RiskGrid) => (g.cells["5_5"]!.walking[2] = Number.NaN)],
    ["a value above the normalized range", (g: RiskGrid) => (g.cells["5_5"]!.walking[1] = 1.5)],
    ["a missing coverage URL", (g: RiskGrid) => delete g.meta.coverageGeojsonUrl],
  ])("rejects %s", (_name, corrupt) => {
    const asset = nycNativeAsset();
    corrupt(asset);
    expect(() => validateRiskGrid(asset, "nyc")).toThrow();
  });

  it("keeps sparse grids valid for cities that do not declare the polygon guard", () => {
    const sparse = structuredClone(chicagoAsset) as unknown as RiskGrid;
    delete sparse.cells["0_0"];
    expect(() => validateRiskGrid(sparse, "chicago")).not.toThrow();
  });
});

describe("NYC scoring mathematics is unchanged", () => {
  afterEach(() => vi.useRealTimers());

  it("selects the local six-hour bucket with the 70/30 blend", () => {
    const grid = nycNative();
    const [a] = BOROUGH_ROUTES[0]![1];
    const cell = grid.cells[cellKey(grid, a!.lat, a!.lng)]!;
    const v = cell.walking;
    expect(new Set(v).size).toBeGreaterThan(1);
    const avg = (v[0]! + v[1]! + v[2]! + v[3]!) / 4;
    for (const [hour, bucket] of [
      [0, 0],
      [5, 0],
      [6, 1],
      [12, 2],
      [18, 3],
      [23, 3],
    ] as const)
      expect(blendedValue(cell, "walking", hour)).toBeCloseTo(0.7 * v[bucket]! + 0.3 * avg, 12);
  });

  it("reads NYPD wall-clock hours in New York time across DST, without UTC shifts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2025, 6, 2, 3, 30))); // 23:30 EDT
    expect(currentHourIn("America/New_York")).toBe(23);
    vi.setSystemTime(new Date(Date.UTC(2025, 0, 15, 4, 30))); // 23:30 EST
    expect(currentHourIn("America/New_York")).toBe(23);
  });

  it("keeps the 15% recommendation threshold on guarded grids", () => {
    expect(EXPOSURE_CONFIG.minImprovement).toBe(0.15);
    const fastest = route("fast", [ll(0.0025, 0.001), ll(0.0025, 0.009)], 600);
    const alternative = route("calm", [ll(0.0075, 0.001), ll(0.0075, 0.009)], 660);
    const at = (lower: number) =>
      recommend(
        [fastest, alternative],
        syntheticGuarded((row) => (row < 5 ? 0.5 : lower)),
        "walking",
        12,
        5,
      )!;
    const below = at(0.5 * 0.86);
    expect(below.reason).toBe("not-meaningful");
    expect(below.recommended.id).toBe("fast");
    const above = at(0.5 * 0.84);
    expect(above.reason).toBe("improved");
    expect(above.recommended.id).toBe("calm");
    expect(above.improvement).toBeCloseTo(0.16, 6);
  });
});

describe("NYC source and model disclosure", () => {
  it("exposes the audited source facts carried in the grid metadata", () => {
    const facts = nycSourceFacts(nycNative().meta)!;
    expect(facts).toMatchObject({
      version: "nyc-native-v1",
      period: "2025-01-01 to 2025-12-31",
      retrieved: "2026-10-04",
      eligible: 34067,
      merged: 56375,
      excluded: 22308,
      premises: ["STREET", "PARK/PLAYGROUND"],
      grandLarcenyPdCodes: ["404", "406", "408", "414", "415", "417", "419"],
      timeExcluded: 1705 + 29,
    });
    expect(facts.releases).toEqual([
      { id: "qgea-i56i", lastReport: "2025-12-31" },
      { id: "5uac-w243", lastReport: "2026-06-30" },
    ]);
    expect(facts.categories).toEqual([
      { code: "105", label: "ROBBERY", complaints: 6986 },
      { code: "106", label: "FELONY ASSAULT", complaints: 7666 },
      { code: "109", label: "GRAND LARCENY", complaints: 2891 },
      { code: "344", label: "ASSAULT 3 & RELATED OFFENSES", complaints: 16524 },
    ]);
    expect(facts.categories.reduce((s, c) => s + c.complaints, 0)).toBe(facts.eligible);
  });

  it("preserves unknown provenance fields through validation", () => {
    const raw = JSON.parse(nycNativeText);
    const grid = validateRiskGrid(raw, "nyc");
    expect(grid.meta.provenance).toEqual(raw.meta.provenance);
    expect(grid.meta.limitations).toEqual(raw.meta.limitations);
  });

  function methodology(grid: RiskGrid) {
    return render(
      <I18nProvider>
        <MethodologyModal open onClose={() => {}} grid={grid} />
      </I18nProvider>,
    );
  }

  it("shows NYC scope and caveats without the SSP severity table", () => {
    methodology(nycNative());
    expect(
      screen.getByRole("region", { name: "Historical reported outdoor-complaint exposure" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lower modeled exposure/)).toBeInTheDocument();
    expect(screen.getByText("qgea-i56i: reports through 2025-12-31")).toBeInTheDocument();
    expect(screen.getByText("5uac-w243: reports through 2026-06-30")).toBeInTheDocument();
    expect(screen.getByText(/not victims or every offense/)).toBeInTheDocument();
    expect(screen.getByText(/1\D?734 complaints with missing/)).toBeInTheDocument();
    expect(screen.getByText(/Driving unsupported/)).toBeInTheDocument();
    expect(screen.getByText(/precinct station houses/)).toBeInTheDocument();
    expect(screen.getByText(/approximate midblock/)).toBeInTheDocument();
    expect(screen.getByText(/Equal weights/)).toBeInTheDocument();
    expect(screen.getByText(/not comparable across cities/)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Severity" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/safer|probability of crime/i);
  });

  it("leaves other cities' methodology unchanged", () => {
    const chicago = validateRiskGrid(chicagoAsset, "chicago");
    expect(nycSourceFacts(chicago.meta)).toBeNull();
    methodology(chicago);
    expect(
      screen.queryByRole("region", { name: "Historical reported outdoor-complaint exposure" }),
    ).not.toBeInTheDocument();
  });
});

describe("other cities keep their behavior", () => {
  it.each([
    ["chicago", chicagoAsset],
    ["san-francisco", sfAsset],
    ["london", londonAsset],
  ] as const)("%s needs no polygon geometry", (id, asset) => {
    const grid = validateRiskGrid(asset, id);
    expect(grid.meta.requiresPolygonCoverageGuard).toBeUndefined();
    expect(grid.coverageGeometry).toBeUndefined();
    const [w, s, e, n] = grid.meta.coverageBounds!;
    const inside = route("in", [
      ll(s + (n - s) * 0.4, w + (e - w) * 0.4),
      ll(s + (n - s) * 0.6, w + (e - w) * 0.6),
    ]);
    expect(routeCoverage(inside, grid, "walking")).toBe("covered");
  });

  it("does not attach a mask to an unguarded grid during loading", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => chicagoAsset }));
    vi.stubGlobal("fetch", fetchMock);
    const { loadRiskGrid } = await import("@/services/riskDataService");
    const grid = await loadRiskGrid(CITIES.find((c) => c.id === "chicago")!);
    expect(grid?.coverageGeometry).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
