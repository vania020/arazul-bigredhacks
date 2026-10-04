import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { hasExposureComparison } from "./exposureService";
import type { Recommendation, ScoredRoute } from "@/types/route";

/**
 * Lower-exposure routes Arazul already generated (within the hard extraTime.max search cap) that
 * the recommendation skipped only because they exceed the user's current extra-time budget.
 * Shown for transparency and user choice; the recommendation itself is unchanged.
 * Uses cached, already-scored candidates only: no Google requests.
 */
export interface OutsideBudgetOption {
  route: ScoredRoute;
  /** Minutes vs the fastest route as the route cards show them (rounded), never ≤ the budget. */
  extraMin: number;
  /** Minutes beyond the user's current budget (extraMin − budget, at least 1). */
  overLimitMin: number;
  /** Whole-minute allowance that makes the route eligible (exact extra time rounded up). */
  allowMin: number;
  /** Exposure reduction vs the fastest route, in percent. */
  improvementPct: number;
}

export type HiddenReason =
  | "within-budget"
  | "beyond-search-cap"
  | "no-comparison"
  | "below-min-improvement"
  | "not-lower-than-recommended"
  | "dominated"
  | "not-shown";

export function outsideBudgetOptions(
  rec: Recommendation | null,
  scored: ScoredRoute[],
  budgetMin: number,
): { options: OutsideBudgetOption[]; hidden: Record<string, HiddenReason> } {
  const hidden: Record<string, HiddenReason> = {};
  if (!rec) return { options: [], hidden };
  const fastest = rec.fastest;
  const budgetSec = fastest.durationSec + budgetMin * 60;
  const capSec = fastest.durationSec + C.extraTime.max * 60;
  const comparable = hasExposureComparison(rec) && fastest.exposure > 0;
  const eligible = new Set(rec.eligible.map((r) => r.id));
  const improvement = (r: ScoredRoute) => (fastest.exposure - r.exposure) / fastest.exposure;

  const qualifying: ScoredRoute[] = [];
  for (const r of scored) {
    if (eligible.has(r.id)) continue;
    if (r.durationSec <= budgetSec) hidden[r.id] = "within-budget";
    else if (r.durationSec > capSec) hidden[r.id] = "beyond-search-cap";
    else if (!comparable || r.coverage !== "covered") hidden[r.id] = "no-comparison";
    else if (improvement(r) < C.minImprovement) hidden[r.id] = "below-min-improvement";
    else if (r.exposure > rec.recommended.exposure * (1 - C.outsideBudget.minGainOverRecommended))
      hidden[r.id] = "not-lower-than-recommended";
    else qualifying.push(r);
  }

  // Keep only options no other option beats on both time and exposure (exact ties: keep the
  // first, so identical alternatives are never listed twice).
  const frontier = qualifying.filter((r, i) => {
    const dominated = qualifying.some(
      (o, j) =>
        j !== i &&
        o.durationSec <= r.durationSec &&
        o.exposure <= r.exposure &&
        (o.durationSec < r.durationSec || o.exposure < r.exposure || j < i),
    );
    if (dominated) hidden[r.id] = "dominated";
    return !dominated;
  });
  frontier.sort((a, b) => a.exposure - b.exposure);
  // Featured: the largest reduction, unless a faster option is within a few points of it.
  let featured = frontier[0];
  for (const o of frontier)
    if (
      featured &&
      o.durationSec < featured.durationSec &&
      (improvement(frontier[0]!) - improvement(o)) * 100 <= C.outsideBudget.tieImprovementPts
    )
      featured = o;
  const ordered = featured ? [featured, ...frontier.filter((r) => r !== featured)] : [];
  ordered.slice(C.outsideBudget.maxShown).forEach((r) => (hidden[r.id] = "not-shown"));

  const options = ordered.slice(0, C.outsideBudget.maxShown).map((route) => {
    const exact = (route.durationSec - fastest.durationSec) / 60;
    // Display like the route cards (rounded) unless rounding would hide that it exceeds the budget.
    const extraMin = Math.round(exact) > budgetMin ? Math.round(exact) : Math.ceil(exact);
    return {
      route,
      extraMin,
      overLimitMin: Math.max(1, extraMin - budgetMin),
      allowMin: Math.ceil(exact),
      improvementPct: Math.round(improvement(route) * 100),
    };
  });
  return { options, hidden };
}
