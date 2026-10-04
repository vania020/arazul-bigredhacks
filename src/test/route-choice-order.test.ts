import { describe, expect, it } from "vitest";
import { routeOptions } from "@/components/routeFacts";
import type { Recommendation, ScoredRoute } from "@/types/route";

const route = (id: string): ScoredRoute => ({
  id,
  source: "google",
  path: [],
  distanceMeters: 1000,
  durationSec: 600,
  coverage: "covered",
  exposure: 10,
  index: 0,
  hotspots: [],
  hotspotMeters: 0,
  contributors: {},
});
const [recommended, fastest, a, b, c] = ["recommended", "fastest", "a", "b", "c"].map(route);
const rec: Recommendation = {
  recommended: recommended!,
  fastest: fastest!,
  eligible: [recommended!, fastest!, a!, b!, c!],
  reason: "improved",
  improvement: 0.1,
  extraMin: 1,
};

describe("route choice positions", () => {
  it("keeps alternatives in place when switching between them", () => {
    const first = routeOptions(rec, "a");
    const second = routeOptions(rec, "b");
    expect(first.options.map((o) => o.route.id)).toEqual(second.options.map((o) => o.route.id));
    expect(second.current.route.id).toBe("b");
  });
  it("keeps a route selected on the map available without displacing the original choices", () => {
    const { options, current } = routeOptions(rec, "c");
    expect(options.map((o) => o.route.id)).toEqual(["recommended", "fastest", "a", "b", "c"]);
    expect(current.route.id).toBe("c");
  });
});
