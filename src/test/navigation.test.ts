import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateRoute, LatLng } from "@/types/route";
import type { RiskGrid } from "@/types/risk";

const mocks = vi.hoisted(() => ({ computeRoutes: vi.fn() }));
vi.mock("@/services/routingService", () => ({ computeRoutes: mocks.computeRoutes }));

import { buildNavRoute } from "@/navigation/navRoute";
import { initialTracker, updateTracker, type Fix, type TrackerState } from "@/navigation/tracker";
import { nextVoicePrompt } from "@/navigation/voice";
import { describeFailure, planReroute, RerouteError, rejoinWaypoints } from "@/navigation/reroute";
import { formatDistance } from "@/navigation/format";
import { fetchStepsFor, viaPointsAlong } from "@/navigation/stepsFallback";
import { cellKey } from "@/services/exposureService";
import { samplePath } from "@/services/geo";

const BASE = { lat: -23.55, lng: -46.63 };
const M_LAT = 111320;
const M_LNG = 111320 * Math.cos((BASE.lat * Math.PI) / 180);
/** Point `north` / `east` meters from BASE. */
const at = (north: number, east = 0): LatLng => ({
  lat: BASE.lat + north / M_LAT,
  lng: BASE.lng + east / M_LNG,
});

// 300 m north on "Rua A", then turn right for 300 m east on "Rua B".
const corner = at(300);
const end = at(300, 300);
const lRoute: CandidateRoute = {
  id: "L",
  source: "google",
  path: [at(0), at(150), corner, at(300, 150), end],
  distanceMeters: 600,
  durationSec: 480,
  steps: [
    {
      instruction: "Head north on Rua A",
      maneuver: "DEPART",
      distanceMeters: 300,
      durationSec: 240,
      path: [at(0), at(150), corner],
    },
    {
      instruction: "Turn right onto Rua B\nDestination will be on the left",
      maneuver: "TURN_RIGHT",
      distanceMeters: 300,
      durationSec: 240,
      path: [corner, at(300, 150), end],
    },
  ],
};

let t0 = 1_000_000;
const fix = (p: LatLng, accuracyM = 8, dtMs = 1000): Fix => {
  t0 += dtMs;
  return { ...p, accuracyM, headingDeg: null, speedMps: null, timestamp: t0 };
};

function feed(route = buildNavRoute(lRoute, "Follow"), points: Fix[], state?: TrackerState) {
  let s = state ?? initialTracker();
  const results = points.map((f) => {
    const r = updateTracker(route, s, f, "walking");
    s = r.state;
    return r;
  });
  return { results, state: s, last: results[results.length - 1]! };
}

describe("navigation route model", () => {
  it("uses Google's steps on exactly the selected geometry", () => {
    const nav = buildNavRoute(lRoute, "Follow");
    expect(nav.hasGoogleSteps).toBe(true);
    expect(nav.steps.map((s) => s.instruction)).toEqual([
      "Head north on Rua A",
      "Turn right onto Rua B",
    ]);
    expect(nav.steps[1]!.detail).toBe("Destination will be on the left");
    expect(nav.steps[1]!.startM).toBeCloseTo(300, 0);
    expect(nav.lengthM).toBeCloseTo(600, -1);
    expect(nav.path).toHaveLength(5); // shared corner vertex is not duplicated
  });

  it("falls back to a single follow-the-route step without Google steps", () => {
    const { steps: _steps, ...noSteps } = lRoute;
    const nav = buildNavRoute(noSteps, "Follow the route");
    expect(nav.hasGoogleSteps).toBe(false);
    expect(nav.steps).toHaveLength(1);
    expect(nav.steps[0]!.instruction).toBe("Follow the route");
  });
});

describe("route matching and step progression", () => {
  it("shows the departure instruction first, then the upcoming maneuver", () => {
    const { results } = feed(undefined, [fix(at(0)), fix(at(60))]);
    const [start, moving] = results;
    expect(start!.progress!.departing).toBe(true);
    expect(start!.progress!.primary).toMatchObject({ instruction: "Head north on Rua A" });
    expect(moving!.progress!.primary).toMatchObject({ instruction: "Turn right onto Rua B" });
    expect(moving!.progress!.distanceToManeuverM).toBeCloseTo(240, -1);
  });

  it("advances to the next step only after the maneuver is clearly completed", () => {
    const { results } = feed(undefined, [
      fix(at(0)),
      fix(at(150)),
      fix(at(297)),
      fix(at(306)), // overshoot north of the corner: still before the turn
      fix(at(300, 4)), // at the corner, within the advance margin
      fix(at(300, 25)), // clearly on Rua B
    ]);
    expect(results.map((r) => r.state.stepIndex)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(results[5]!.progress!.primary).toBe("arrive");
  });

  it("does not mark GPS jitter as off-route or move progress backwards", () => {
    const jitter = [20, -20, 18, -15, 22, -19, 10, -22].map((east, i) =>
      fix(at(40 + i * 10, east), 10),
    );
    const { results } = feed(undefined, jitter);
    expect(results.every((r) => r.onRoute)).toBe(true);
    expect(results.every((r) => r.state.offRouteCount === 0)).toBe(true);
    const along = results.map((r) => r.state.alongM!);
    along.slice(1).forEach((a, i) => expect(a).toBeGreaterThanOrEqual(along[i]!));
  });

  it("ignores small backward projections (jitter) but keeps real progress", () => {
    const { results } = feed(undefined, [fix(at(100)), fix(at(92))]);
    expect(results[1]!.state.alongM).toBeCloseTo(results[0]!.state.alongM!, 5);
  });

  it("needs several trusted readings over time before declaring off-route", () => {
    const { state } = feed(undefined, [fix(at(0)), fix(at(100))]);
    const away = at(100, 120);
    // One outlier: counted but not confirmed.
    const one = feed(undefined, [fix(away)], state);
    expect(one.last.offRoute).toBe(false);
    // Three quick readings: still under the minimum duration.
    const quick = feed(undefined, [fix(away), fix(away), fix(away)], state);
    expect(quick.last.state.offRouteCount).toBe(3);
    expect(quick.last.offRoute).toBe(false);
    // Sustained: confirmed.
    const sustained = feed(
      undefined,
      [fix(away, 8, 3000), fix(away, 8, 3000), fix(away, 8, 3000)],
      state,
    );
    expect(sustained.last.offRoute).toBe(true);
    // Returning to the route resets the counter.
    const back = feed(undefined, [fix(at(110))], sustained.state);
    expect(back.last.state.offRouteCount).toBe(0);
  });

  it("never counts inaccurate readings toward off-route or progress", () => {
    const { state } = feed(undefined, [fix(at(0)), fix(at(100))]);
    const weak = feed(
      undefined,
      [1, 2, 3, 4, 5].map(() => fix(at(100, 120), 90, 20000)),
      state,
    );
    expect(weak.results.every((r) => r.quality === "weak" && !r.offRoute)).toBe(true);
    expect(weak.state.offRouteCount).toBe(0);
    expect(weak.state.alongM).toBe(state.alongM);
    const ignored = feed(undefined, [fix(at(500, 500), 400)], state);
    expect(ignored.last.quality).toBe("ignored");
    expect(ignored.state).toBe(state);
  });

  it("confirms arrival near the destination", () => {
    const { state } = feed(undefined, [fix(at(0)), fix(at(300, 100)), fix(at(300, 250))]);
    const first = feed(undefined, [fix(at(300, 290), 20)], state);
    expect(first.last.arrived).toBe(false);
    const second = feed(undefined, [fix(at(300, 296), 20)], first.state);
    expect(second.last.arrived).toBe(true);
  });

  it("estimates remaining time locally from step durations", () => {
    const { last } = feed(undefined, [fix(at(0)), fix(at(150))]);
    expect(last.progress!.remainingM).toBeCloseTo(450, -1);
    expect(last.progress!.remainingSec).toBeCloseTo(360, -1);
  });
});

describe("voice prompts", () => {
  it("speaks each distance band once and never repeats a farther band", () => {
    const nav = buildNavRoute(lRoute, "Follow");
    const announced = new Set<string>();
    const bands = [120, 20];
    const prompts: (string | null)[] = [];
    let s = initialTracker();
    for (const north of [0, 60, 100, 190, 200, 210, 285, 290]) {
      const r = updateTracker(nav, s, fix(at(north)), "walking");
      s = r.state;
      const p = nextVoicePrompt(r.progress!, bands, announced, 0);
      if (p) announced.add(p.key);
      prompts.push(p?.key ?? null);
    }
    expect(prompts.filter(Boolean)).toEqual(["0:1:0", "0:1:1"]);
  });
});

describe("distance formatting", () => {
  it("rounds like a navigation display", () => {
    expect(formatDistance(243, "metric")).toEqual({ value: "240", unit: "m" });
    expect(formatDistance(1530, "metric")).toEqual({ value: "1.5", unit: "km" });
    expect(formatDistance(76, "imperial")).toEqual({ value: "250", unit: "ft" });
    expect(formatDistance(4828, "imperial")).toEqual({ value: "3.0", unit: "mi" });
  });
});

describe("preference-preserving reroute", () => {
  // Fast route straight north through reported-incident cells; slower route loops east of them.
  const fast: CandidateRoute = {
    id: "fast",
    source: "google",
    path: [at(0), at(400), at(800)],
    distanceMeters: 800,
    durationSec: 600,
  };
  const safer: CandidateRoute = {
    id: "safer",
    source: "google",
    path: [at(0), at(0, 300), at(800, 300), at(800)],
    distanceMeters: 1400,
    durationSec: 780,
  };
  const meta = {
    cellSizeM: 100,
    originLat: BASE.lat - 0.02,
    originLon: BASE.lng - 0.02,
    rows: 60,
    cols: 60,
    buckets: ["0", "6", "12", "18"],
    modes: ["walking", "driving"] as ("walking" | "driving")[],
    source: "fixture",
    period: "fixture",
    incidentsUsed: 10,
  };
  const grid: RiskGrid = { meta, cells: {}, isDemo: false };
  for (const { p } of samplePath(fast.path.slice(0, 2).concat(at(700)), 30))
    grid.cells[cellKey(grid, p.lat, p.lng)] = {
      walking: [40, 40, 40, 40],
      driving: [40, 40, 40, 40],
    };

  const from = at(100, 60);
  const destination = { label: "Destination", latLng: at(800) };
  const base = {
    from,
    fromLabel: "Your location",
    destination,
    mode: "walking" as const,
    grid,
    hour: 12,
    extraMin: 5,
    resumeFromM: 90,
  };

  beforeEach(() => {
    mocks.computeRoutes.mockReset();
  });

  it("keeps choosing Arazul's lower-exposure route, from the current location", async () => {
    mocks.computeRoutes.mockImplementation(async (q: { intermediates?: LatLng[] }) =>
      q.intermediates ? [] : [fast, safer],
    );
    const plan = await planReroute({ ...base, preference: "recommended", previous: safer });
    expect(plan.route.id).toBe("safer");
    expect(plan.rec.reason).toBe("improved");
    for (const [q] of mocks.computeRoutes.mock.calls)
      expect(q).toMatchObject({ origin: { latLng: from }, destination, mode: "walking" });
  });

  it("keeps the fastest preference when that is what the user chose", async () => {
    mocks.computeRoutes.mockResolvedValue([fast, safer]);
    const plan = await planReroute({ ...base, preference: "fastest", previous: fast });
    expect(plan.route.id).toBe("fast");
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("guides a custom choice back onto its own remaining geometry", async () => {
    const rejoined: CandidateRoute = { ...safer, id: "rejoined", source: "detour" };
    mocks.computeRoutes.mockResolvedValue([rejoined]);
    const plan = await planReroute({ ...base, preference: "custom", previous: safer });
    expect(plan.route.id).toBe("rejoined");
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
    const [q] = mocks.computeRoutes.mock.calls[0]!;
    expect(q.alternatives).toBe(false);
    expect(q.intermediates.length).toBeGreaterThan(0);
  });

  it("places the rejoin point ahead on the previous route", () => {
    const plan = rejoinWaypoints({ path: safer.path }, at(10, 320), 0, 120, 40);
    expect(plan.finalApproach).toBe(false);
    expect(plan.vias).toHaveLength(1);
    // Closest point is ~10 m up the east leg (along ≈ 310 m); rejoin is 120 m further.
    expect(plan.vias[0]!.lat).toBeCloseTo(at(130, 300).lat, 4);
    expect(plan.vias[0]!.lng).toBeCloseTo(at(130, 300).lng, 4);
    // Close to the end the rejoin point moves to halfway along the remainder…
    const near = rejoinWaypoints({ path: safer.path }, at(800, 150), 1100, 120, 40);
    expect(near.vias).toHaveLength(1);
    // …and in the final approach the destination itself is the rejoin point.
    expect(rejoinWaypoints({ path: safer.path }, at(790, 10), 1300, 120, 40)).toEqual({
      vias: [],
      finalApproach: true,
    });
  });

  // Fastest overall, but it leaves the risk-grid coverage area.
  const outside: CandidateRoute = {
    id: "outside",
    source: "google",
    path: [at(0), at(0, 5000), at(800)],
    distanceMeters: 900,
    durationSec: 500,
  };
  const rejoined: CandidateRoute = { ...safer, id: "rejoined", source: "detour" };
  const byKind =
    (alts: () => Promise<CandidateRoute[]>, back: () => Promise<CandidateRoute[]>) =>
    async (q: { intermediates?: LatLng[] }) => (q.intermediates ? back() : alts());

  it("does not fall back to Google's fastest when one candidate leaves coverage", async () => {
    mocks.computeRoutes.mockImplementation(
      byKind(
        async () => [outside, fast, safer],
        async () => [],
      ),
    );
    const plan = await planReroute({ ...base, preference: "recommended", previous: safer });
    expect(plan.basis).toBe("compared");
    expect(plan.route.id).toBe("safer");
    expect(plan.rec.eligible.map((r) => r.id)).not.toContain("outside");
  });

  it("rejoins the selected route when no comparison is possible (no risk data)", async () => {
    mocks.computeRoutes.mockImplementation(
      byKind(
        async () => [fast, safer],
        async () => [rejoined],
      ),
    );
    const plan = await planReroute({
      ...base,
      grid: null,
      preference: "recommended",
      previous: safer,
    });
    expect(plan.basis).toBe("rejoin");
    expect(plan.route.id).toBe("rejoined");
  });

  it("still rejoins when the alternatives request fails", async () => {
    mocks.computeRoutes.mockImplementation(
      byKind(
        async () => {
          throw new Error("UNKNOWN_ERROR");
        },
        async () => [rejoined],
      ),
    );
    const plan = await planReroute({ ...base, preference: "recommended", previous: safer });
    expect(plan.route.id).toBe("rejoined");
  });

  it("raises NO_SAFE_ROUTE instead of substituting a route, without leaking the key", async () => {
    const key = "AIza" + "SyD-abcdefghijklmnopqrstuvwxyz0123";
    mocks.computeRoutes.mockImplementation(
      byKind(
        async () => [outside],
        async () => {
          throw new Error(`MapsRequestError: PERMISSION_DENIED https://x.test/?key=${key}&a=1`);
        },
      ),
    );
    const error = await planReroute({
      ...base,
      preference: "recommended",
      previous: safer,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RerouteError);
    expect((error as RerouteError).code).toBe("NO_SAFE_ROUTE");
    const detail = (error as RerouteError).failures.join(" ");
    expect(detail).toContain("PERMISSION_DENIED");
    expect(detail).not.toContain(key);
    expect(describeFailure(new Error(key))).not.toContain(key);
  });

  it("never replaces a custom choice when its rejoin fails", async () => {
    mocks.computeRoutes.mockImplementation(
      byKind(
        async () => [fast],
        async () => [],
      ),
    );
    await expect(
      planReroute({ ...base, preference: "custom", previous: safer }),
    ).rejects.toMatchObject({ code: "NO_SAFE_ROUTE" });
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("routes straight to the destination in the final approach", async () => {
    mocks.computeRoutes.mockResolvedValue([rejoined]);
    await planReroute({
      ...base,
      from: at(790, 10),
      resumeFromM: 1300,
      preference: "custom",
      previous: safer,
    });
    expect(mocks.computeRoutes.mock.calls[0]![0].intermediates).toBeUndefined();
  });

  it("reports no route when Google returns nothing", async () => {
    mocks.computeRoutes.mockResolvedValue([]);
    await expect(
      planReroute({ ...base, preference: "fastest", previous: fast }),
    ).rejects.toMatchObject({ code: "NO_ROUTE" });
  });
});

describe("steps fallback for routes without Google steps", () => {
  const { steps: _s, ...rest } = lRoute;
  const geometryOnly: CandidateRoute = rest;

  beforeEach(() => {
    mocks.computeRoutes.mockReset();
  });

  it("spreads via waypoints evenly along Arazul's geometry", () => {
    const vias = viaPointsAlong(lRoute.path, 2);
    expect(vias).toHaveLength(2);
    expect(vias[0]!.lat).toBeCloseTo(at(200).lat, 4); // 1/3 of 600 m
    expect(vias[1]!.lng).toBeCloseTo(at(300, 100).lng, 4); // 2/3 of 600 m
  });

  it("takes Google's steps when Google follows the same geometry", async () => {
    mocks.computeRoutes.mockResolvedValue([{ ...lRoute, id: "g" }]);
    const result = await fetchStepsFor(geometryOnly, "walking", "en");
    expect(result?.id).toBe("L"); // Arazul's route identity is kept
    expect(result?.steps?.[1]?.instruction).toContain("Turn right onto Rua B");
    const [q] = mocks.computeRoutes.mock.calls[0]!;
    expect(q).toMatchObject({ alternatives: false, mode: "walking" });
    expect(q.intermediates).toHaveLength(8);
  });

  it("rejects a Google route that leaves Arazul's geometry", async () => {
    const elsewhere: CandidateRoute = {
      ...lRoute,
      id: "g",
      path: [at(0), at(0, -400), at(300, -400), at(300, 300)],
    };
    mocks.computeRoutes.mockResolvedValue([elsewhere]);
    expect(await fetchStepsFor(geometryOnly, "walking")).toBeNull();
  });

  it("returns null when Google still sends no steps", async () => {
    mocks.computeRoutes.mockResolvedValue([{ ...geometryOnly, id: "g" }]);
    expect(await fetchStepsFor(geometryOnly, "walking")).toBeNull();
  });
});

describe("short first step", () => {
  it("does not hide the first turn behind the departure instruction", () => {
    // Google often starts with a few metres of "Head north…" before the first turn.
    const shortStart: CandidateRoute = {
      ...lRoute,
      path: [at(0), at(12), at(12, 300)],
      steps: [
        {
          instruction: "Head north on Rua A",
          maneuver: "DEPART",
          distanceMeters: 12,
          durationSec: 10,
          path: [at(0), at(12)],
        },
        {
          instruction: "Turn right onto Rua B",
          maneuver: "TURN_RIGHT",
          distanceMeters: 300,
          durationSec: 240,
          path: [at(12), at(12, 300)],
        },
      ],
    };
    const nav = buildNavRoute(shortStart, "Follow");
    const { results } = feed(nav, [fix(at(0)), fix(at(8))]);
    expect(results[0]!.progress!.primary).toMatchObject({ instruction: "Head north on Rua A" });
    expect(results[1]!.progress!.primary).toMatchObject({ instruction: "Turn right onto Rua B" });
    const prompt = nextVoicePrompt(results[1]!.progress!, [120, 20], new Set(), 0);
    expect(prompt).toMatchObject({ now: true }); // spoken, not skipped
  });
});
