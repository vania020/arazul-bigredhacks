import { describe, expect, it } from "vitest";
import { outsideBudgetOptions } from "@/services/outsideBudget";
import type { Recommendation, ScoredRoute } from "@/types/route";

const route = (
  id: string,
  minutes: number,
  exposure: number,
  coverage: ScoredRoute["coverage"] = "covered",
): ScoredRoute => ({
  id,
  source: "google",
  path: [],
  distanceMeters: 1000,
  durationSec: Math.round(minutes * 60),
  coverage,
  exposure,
  index: 0,
  hotspots: [],
  hotspotMeters: 0,
  contributors: {},
});

const rec = (
  fastest: ScoredRoute,
  eligible: ScoredRoute[],
  recommended = fastest,
  reason: Recommendation["reason"] = "not-meaningful",
): Recommendation => ({
  fastest,
  recommended,
  eligible: [fastest, ...eligible],
  reason,
  improvement: 0,
  extraMin: 0,
});

const fastest = route("fastest", 20, 100);
const withinBudget = route("A", 24, 90); // +4 min, 10% lower

describe("lower-exposure options outside the time budget", () => {
  it("leaves routes inside the budget to the normal recommendation", () => {
    const { options, hidden } = outsideBudgetOptions(
      rec(fastest, [withinBudget]),
      [fastest, withinBudget],
      5,
    );
    expect(options).toEqual([]);
    expect(hidden["A"]).toBeUndefined();
  });

  it("does not surface an outside-budget route with < 15% lower exposure", () => {
    const slight = route("B", 27, 96);
    const { options, hidden } = outsideBudgetOptions(
      rec(fastest, [withinBudget]),
      [fastest, withinBudget, slight],
      5,
    );
    expect(options).toEqual([]);
    expect(hidden["B"]).toBe("below-min-improvement");
  });

  it("surfaces a meaningfully lower-exposure route that only exceeds the budget", () => {
    const lower = route("B", 29, 71);
    const { options } = outsideBudgetOptions(
      rec(fastest, [withinBudget]),
      [fastest, withinBudget, lower],
      5,
    );
    expect(options.map((o) => o.route.id)).toEqual(["B"]);
    expect(options[0]!.improvementPct).toBe(29);
  });

  it("separates total extra time from time beyond the user's limit", () => {
    const lower = route("B", 29, 71);
    const [o] = outsideBudgetOptions(rec(fastest, []), [fastest, lower], 5).options;
    expect(o).toMatchObject({ extraMin: 9, overLimitMin: 4, allowMin: 9 });
    // Real routes are rarely whole minutes: 9 min 2 s shows as +9 (like the route cards) and
    // 4 min beyond the limit, while the allowance that makes it eligible is +10.
    const [q] = outsideBudgetOptions(
      rec(fastest, []),
      [fastest, route("C", 29 + 2 / 60, 70)],
      5,
    ).options;
    expect(q).toMatchObject({ extraMin: 9, overLimitMin: 4, allowMin: 10 });
    // Rounding never makes an over-budget route look within the budget.
    const [p] = outsideBudgetOptions(rec(fastest, []), [fastest, route("D", 25.2, 70)], 5).options;
    expect(p).toMatchObject({ extraMin: 6, overLimitMin: 1, allowMin: 6 });
  });

  it("requires a real gain over the current recommendation, and respects the search cap", () => {
    const recommended = route("R", 23, 75); // already 25% lower, within budget
    const marginal = route("B", 29, 73);
    const better = route("C", 30, 60);
    const tooFar = route("D", 36, 40); // beyond the +15 min search cap
    const r = rec(fastest, [recommended], recommended, "improved");
    const { options, hidden } = outsideBudgetOptions(
      r,
      [fastest, recommended, marginal, better, tooFar],
      5,
    );
    expect(hidden["B"]).toBe("not-lower-than-recommended");
    expect(hidden["D"]).toBe("beyond-search-cap");
    expect(options.map((o) => o.route.id)).toEqual(["C"]);
  });

  it("shows one best option first, without duplicates or dominated routes", () => {
    const lowest = route("B", 29, 71); // 29%
    const faster = route("C", 27, 73); // 27%: within 3 points of B and faster
    const dominated = route("D", 30, 75); // slower and higher than B
    const twin = route("E", 27, 73); // identical to C
    // Close options: the faster one is featured.
    const close = outsideBudgetOptions(
      rec(fastest, []),
      [fastest, lowest, faster, dominated, twin],
      5,
    );
    expect(close.options.map((o) => o.route.id)).toEqual(["C", "B"]);
    expect(close.hidden["D"]).toBe("dominated");
    expect(close.hidden["E"]).toBe("dominated");
    // A much larger reduction is featured; the rest stay available under "more options".
    const much = route("F", 33, 50); // 50%
    const wide = outsideBudgetOptions(rec(fastest, []), [fastest, lowest, faster, much], 5);
    expect(wide.options.map((o) => o.route.id)).toEqual(["F", "B", "C"]);
  });

  it("never claims an exposure difference without a valid comparison", () => {
    const lower = route("B", 29, 71);
    for (const reason of ["unavailable", "outside-coverage", "unsupported-mode"] as const) {
      const { options, hidden } = outsideBudgetOptions(
        rec(fastest, [], fastest, reason),
        [fastest, lower],
        5,
      );
      expect(options).toEqual([]);
      expect(hidden["B"]).toBe("no-comparison");
    }
    const outside = route("C", 29, 50, "outside-coverage");
    expect(outsideBudgetOptions(rec(fastest, []), [fastest, outside], 5).options).toEqual([]);
    expect(outsideBudgetOptions(null, [fastest, lower], 5).options).toEqual([]);
  });
});
