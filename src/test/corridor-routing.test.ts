import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { CandidateRoute, LatLng } from "@/types/route";

const mocks = vi.hoisted(() => ({ computeRoutes: vi.fn() }));
vi.mock("@/services/routingService", () => ({ computeRoutes: mocks.computeRoutes }));

import { dedupeRoutes, generateDetours, type DetourTrace } from "@/services/detourService";
import { recommend, scoreRoute } from "@/services/exposureService";
import { distanceM } from "@/services/geo";
import { findCorridor, findCrossings, gridGeometry, sampleRoute } from "@/services/riskRegions";
import { explainRecommendation } from "@/services/routeDebug";
import { buildNavRoute } from "@/navigation/navRoute";

// Synthetic 3 × 3 km city with 100 m cells, centred on BASE. `at(north, east)` in metres.
const BASE = { lat: -23.55, lng: -46.63 };
const M_LAT = 111320;
const M_LNG = 111320 * Math.cos((BASE.lat * Math.PI) / 180);
const at = (north: number, east = 0): LatLng => ({
  lat: BASE.lat + north / M_LAT,
  lng: BASE.lng + east / M_LNG,
});
const eastOf = (p: LatLng) => (p.lng - BASE.lng) * M_LNG;

function makeGrid(
  value: (north: number, east: number) => number | null,
  modes: TravelMode[] = ["walking", "driving"],
): RiskGrid {
  const cells: RiskGrid["cells"] = {};
  for (let r = 0; r < 30; r++)
    for (let c = 0; c < 30; c++) {
      const v = value((r + 0.5) * 100 - 1500, (c + 0.5) * 100 - 1500);
      if (v !== null) cells[`${r}_${c}`] = { walking: [v, v, v, v], driving: [v, v, v, v] };
    }
  return {
    meta: {
      cellSizeM: 100,
      originLat: BASE.lat - 1500 / M_LAT,
      originLon: BASE.lng - 1500 / M_LNG,
      projectionLatitude: BASE.lat,
      rows: 30,
      cols: 30,
      buckets: ["0", "6", "12", "18"],
      modes,
      source: "synthetic",
      period: "test",
      incidentsUsed: 1,
    },
    cells,
    isDemo: false,
  };
}

// A wide connected high-exposure region (1.2 km × 1.4 km) straddling the straight route.
const wideRegion = makeGrid((n, e) => (Math.abs(e) <= 550 && Math.abs(n) <= 700 ? 60 : 1));
// One isolated 2 × 2-cell hotspot on the route, plus a far-away block so "high" is meaningful.
const isolated = makeGrid((n, e) =>
  (Math.abs(e) <= 50 && Math.abs(n) <= 50) || (n >= 350 && e <= -450) ? 60 : 1,
);
// Nothing high near the route at all.
const calm = makeGrid((n, e) => (n >= 250 && e <= -450 ? 60 : 1));

const straight = (mode: TravelMode, speed: number): CandidateRoute => ({
  id: "fastest",
  source: "google",
  path: [at(-1300), at(1300)],
  distanceMeters: 2600,
  durationSec: Math.round(2600 / speed),
});

/** Google stand-in: a route straight through the requested waypoints, with one step per leg. */
function routeThrough(
  q: { origin: { latLng: LatLng }; destination: { latLng: LatLng }; intermediates?: LatLng[] },
  speed: number,
  extra: LatLng[] = [],
): CandidateRoute {
  const path = [q.origin.latLng, ...(q.intermediates ?? []), ...extra, q.destination.latLng];
  let d = 0;
  for (let i = 1; i < path.length; i++) d += distanceM(path[i - 1]!, path[i]!);
  return {
    id: `g${mocks.computeRoutes.mock.calls.length}`,
    source: q.intermediates?.length ? "detour" : "google",
    path,
    distanceMeters: d,
    durationSec: Math.round(d / speed),
    steps: path.slice(1).map((p, i) => ({
      instruction: `Leg ${i + 1}`,
      maneuver: i === 0 ? "DEPART" : "TURN_RIGHT",
      distanceMeters: distanceM(path[i]!, p),
      durationSec: Math.round(distanceM(path[i]!, p) / speed),
      path: [path[i]!, p],
    })),
    ...(q.intermediates ? { via: q.intermediates } : {}),
  };
}

const base = (mode: TravelMode) => ({
  origin: { label: "O", latLng: at(-1300) },
  destination: { label: "D", latLng: at(1300) },
  mode,
  departure: null,
});
const trace = (): DetourTrace => ({ requests: [], duplicates: [] });

async function bypasses(
  grid: RiskGrid,
  mode: TravelMode,
  speed: number,
  opts: { slow?: number; known?: CandidateRoute[] } = {},
) {
  mocks.computeRoutes.mockImplementation(async (q) => [routeThrough(q, speed / (opts.slow ?? 1))]);
  const fastestC = straight(mode, speed);
  const fastest = scoreRoute(fastestC, grid, mode, 12);
  const t = trace();
  const routes = await generateDetours(fastest, base(mode), fastestC.durationSec + 15 * 60, {
    grid,
    mode,
    hour: 12,
    known: opts.known ?? [fastestC],
    trace: t,
  });
  return { fastestC, fastest, routes, trace: t };
}

beforeEach(() => {
  mocks.computeRoutes.mockReset();
});

describe("region-aware bypass generation", () => {
  it("treats a small isolated hotspot as such and detours locally", async () => {
    const { trace: t } = await bypasses(isolated, "driving", 10);
    expect(t.strategy).toBe("corridor");
    expect(t.crossings?.[0]).toMatchObject({ isolated: true, regionCells: 4 });
    const planned = t.corridors!.filter((c) => c.status === "planned");
    expect(planned.length).toBeGreaterThan(0);
    expect(Math.min(...planned.map((c) => c.maxOffsetM))).toBeLessThanOrEqual(400);
  });

  it("detects a large connected region and searches beyond the old fixed 220 m offset", async () => {
    const g = gridGeometry(wideRegion, "driving", 12);
    const samples = sampleRoute(g, straight("driving", 10).path);
    const [crossing] = findCrossings(
      g,
      samples,
      scoreRoute(straight("driving", 10), wideRegion, "driving", 12).exposure,
    );
    expect(crossing!.isolated).toBe(false);
    expect(crossing!.regionCells).toBeGreaterThanOrEqual(150);
    const corridor = findCorridor(g, samples, crossing!, {
      lambda: g.highValue,
      maxLateralM: 1500,
    })!;
    expect(corridor.maxOffsetM).toBeGreaterThan(550); // the region is 550 m wide on each side
    expect(corridor.exposure).toBeLessThan(crossing!.exposure / 5);
  });

  it("actually requests and recommends the safer corridor farther away, on both sides", async () => {
    const { fastestC, routes, trace: t } = await bypasses(wideRegion, "driving", 10);
    const waypoints = t.requests.filter((q) => q.status === "ok").flatMap((q) => q.waypoints);
    expect(waypoints.length).toBeGreaterThan(0);
    // Every waypoint sits outside the region, well beyond the old ±220 m offset…
    for (const p of waypoints) expect(Math.abs(eastOf(p))).toBeGreaterThan(550);
    // …and both sides of the region were explored.
    expect(waypoints.some((p) => eastOf(p) > 0)).toBe(true);
    expect(waypoints.some((p) => eastOf(p) < 0)).toBe(true);
    const rec = recommend([fastestC, ...routes], wideRegion, "driving", 12, 5)!;
    expect(rec.reason).toBe("improved");
    expect(rec.recommended.label).toMatch(/^Bypass 1/);
    expect(rec.improvement).toBeGreaterThanOrEqual(0.15); // meaningful under the 15% rule
  });

  it("keeps sensible behaviour when there is nothing worth avoiding", async () => {
    const { routes, trace: t } = await bypasses(calm, "driving", 10);
    expect(t.strategy).toBe("local"); // no high crossing: original strategy, which finds nothing
    expect(routes).toEqual([]);
    expect(mocks.computeRoutes).not.toHaveBeenCalled();
    const fastestC = straight("driving", 10);
    expect(recommend([fastestC], calm, "driving", 12, 5)!.recommended.id).toBe("fastest");
  });

  it("reports a much safer bypass that is too slow as outside the time budget", async () => {
    const { fastestC, routes, trace: t } = await bypasses(wideRegion, "driving", 10, { slow: 3 });
    const rec = recommend([fastestC, ...routes], wideRegion, "driving", 12, 5)!;
    expect(rec.recommended.id).toBe("fastest");
    const info = explainRecommendation({
      candidates: [fastestC, ...routes],
      rec,
      grid: wideRegion,
      mode: "driving",
      hour: 12,
      extraMin: 5,
      trace: t,
    });
    const bypass = info.rows.find((r) => r.candidate.startsWith("Bypass"))!;
    expect(bypass.improvementPct).toBeGreaterThan(15);
    expect(bypass.outcome).toMatch(/^outside time budget/);
  });

  it("applies the 15% rule to a slightly safer candidate", () => {
    // Same region, but its eastern half is ~13% lighter than the western half.
    const twoTone = makeGrid((n, e) =>
      Math.abs(e) <= 550 && Math.abs(n) <= 700 ? (e < 0 ? 60 : 52) : 1,
    );
    const fastestC: CandidateRoute = {
      ...straight("driving", 10),
      path: [at(-1300, -50), at(1300, -50)],
    };
    const slight: CandidateRoute = {
      id: "slight",
      source: "google",
      path: [at(-1300, 50), at(1300, 50)],
      distanceMeters: 2600,
      durationSec: 280,
    };
    const rec = recommend([fastestC, slight], twoTone, "driving", 12, 5)!;
    expect(rec.reason).toBe("not-meaningful");
    const info = explainRecommendation({
      candidates: [fastestC, slight],
      rec,
      grid: twoTone,
      mode: "driving",
      hour: 12,
      extraMin: 5,
    });
    expect(info.rows[1]!.improvementPct).toBeGreaterThan(0);
    expect(info.rows[1]!.improvementPct).toBeLessThan(15);
    expect(info.rows[1]!.outcome).toBe("<15% exposure improvement");
  });

  it("does not re-request corridors already covered, and drops duplicate geometry", async () => {
    const first = await bypasses(wideRegion, "driving", 10);
    const calls = mocks.computeRoutes.mock.calls.length;
    const second = await bypasses(wideRegion, "driving", 10, {
      known: [straight("driving", 10), ...first.routes],
    });
    expect(second.trace.requests.some((q) => q.status === "skipped-already-covered")).toBe(true);
    expect(mocks.computeRoutes.mock.calls.length - calls).toBeLessThan(calls);
    const a = first.routes[0]!;
    const nearCopy = {
      ...a,
      id: "copy",
      label: "copy",
      path: a.path.map((p) => ({ lat: p.lat + 3 / M_LAT, lng: p.lng })),
    };
    const t = trace();
    expect(dedupeRoutes([a, nearCopy], t)).toEqual([a]);
    expect(t.duplicates[0]).toMatchObject({ dropped: "copy" });
  });

  it("never adds a bypass that leaves the risk-data coverage (it would void the comparison)", async () => {
    mocks.computeRoutes.mockImplementation(async (q) => [routeThrough(q, 10, [at(1300, 1560)])]);
    const fastestC = straight("driving", 10);
    const t = trace();
    const routes = await generateDetours(
      scoreRoute(fastestC, wideRegion, "driving", 12),
      base("driving"),
      fastestC.durationSec + 900,
      {
        grid: wideRegion,
        mode: "driving",
        hour: 12,
        trace: t,
      },
    );
    expect(routes).toEqual([]);
    expect(t.requests.every((q) => q.status !== "ok")).toBe(true);
    expect(t.requests.some((q) => q.status === "outside-coverage")).toBe(true);
  });

  it("falls back to the original strategy without usable risk data", async () => {
    const fastestC = straight("driving", 10);
    const fastest = scoreRoute(fastestC, wideRegion, "driving", 12);
    mocks.computeRoutes.mockImplementation(async (q) => [routeThrough(q, 10)]);
    const walkingOnly = makeGrid(
      (n, e) => (Math.abs(e) <= 550 && Math.abs(n) <= 700 ? 60 : 1),
      ["walking"],
    );
    const t = trace();
    await generateDetours(fastest, base("driving"), fastestC.durationSec + 900, {
      grid: walkingOnly,
      mode: "driving",
      hour: 12,
      trace: t,
    });
    expect(t.strategy).toBe("local");
    // No context at all (e.g. callers without a grid): the original local detours.
    mocks.computeRoutes.mockClear();
    await generateDetours(fastest, base("driving"), fastestC.durationSec + 900);
    for (const [q] of mocks.computeRoutes.mock.calls) expect(q.intermediates).toHaveLength(1);
  });

  it("scales the bypass reach to the travel mode", async () => {
    const driving = await bypasses(wideRegion, "driving", 10);
    const walking = await bypasses(wideRegion, "walking", 1.3);
    expect(walking.trace.thresholds!.maxLateralM).toBeLessThan(
      driving.trace.thresholds!.maxLateralM,
    );
    expect(walking.trace.thresholds!.maxLateralM).toBeLessThanOrEqual(600);
    // A corridor a pedestrian could not walk within the time cap is never requested.
    for (const c of walking.trace.corridors!)
      if (c.estExtraMin > 15 * 1.25) expect(c.status).not.toBe("planned");
  });

  it("keeps Google's own steps on the selected bypass for navigation", async () => {
    const { fastestC, routes } = await bypasses(wideRegion, "driving", 10);
    const rec = recommend([fastestC, ...routes], wideRegion, "driving", 12, 5)!;
    const nav = buildNavRoute(rec.recommended, "Follow the route");
    expect(nav.hasGoogleSteps).toBe(true);
    expect(nav.steps.length).toBe(rec.recommended.steps!.length);
    expect(nav.steps[0]!.instruction).toBe("Leg 1");
  });
});
