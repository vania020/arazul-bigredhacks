import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { scoreRoute } from "./exposureService";
import { routeOverlap } from "./geo";
import { outsideBudgetOptions, type HiddenReason } from "./outsideBudget";
import type { DetourTrace } from "./detourService";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { CandidateRoute, Recommendation } from "@/types/route";

/**
 * Development-only explanation of a recommendation: every generated candidate with its time,
 * exposure and why it was or wasn't chosen, plus requests that produced no candidate. Lets you
 * tell "Arazul considered the side route and rejected it" from "it was never generated".
 * Exposed as `window.__arazulRouteDebug` and logged as a console table in development builds.
 */
/** Diagnostics are collected only in development (never in tests or production builds). */
export const routeDebugEnabled = import.meta.env.DEV && import.meta.env.MODE !== "test";
export const createDetourTrace = (): DetourTrace => ({ requests: [], duplicates: [] });

export interface DebugRow {
  candidate: string;
  min: number;
  extraMin: number;
  km: number;
  exposure: number;
  improvementPct: number;
  overlapWithFastestPct: number;
  /** Recommendation status. */
  outcome: string;
  /** What the route screen does with it (incl. the lower-exposure option outside the budget). */
  display: string;
}

const HIDDEN: Record<HiddenReason, string> = {
  "within-budget": "eligible for recommendation",
  "beyond-search-cap": "hidden: beyond the +15 min search cap",
  "no-comparison": "hidden: no valid exposure comparison",
  "below-min-improvement": "hidden: <15% lower exposure than fastest",
  "not-lower-than-recommended": "hidden: not meaningfully lower than the recommendation",
  dominated: "hidden: another option is faster and lower-exposure",
  "not-shown": "hidden: more options than shown",
};

export function explainRecommendation(args: {
  candidates: CandidateRoute[];
  rec: Recommendation;
  grid: RiskGrid | null;
  mode: TravelMode;
  hour: number;
  extraMin: number;
  trace?: DetourTrace | null;
}) {
  const { candidates, rec, grid, mode, hour, extraMin, trace } = args;
  const fastest = rec.fastest;
  let google = 0;
  const name = (r: CandidateRoute) =>
    r.label ?? (r.source === "google" ? `Google route ${++google}` : `Detour ${r.id}`);
  const scored = candidates.map((c) => scoreRoute(c, grid, mode, hour));
  const outside = outsideBudgetOptions(rec, scored, extraMin);
  const rows: DebugRow[] = candidates.map((c, i) => {
    const r = scored[i]!;
    const shown = outside.options.findIndex((o) => o.route.id === r.id);
    const display = rec.eligible.some((e) => e.id === r.id)
      ? r.id === rec.recommended.id
        ? "recommended card"
        : "route card"
      : shown === 0
        ? "surfaced as lower-exposure option"
        : shown > 0
          ? "listed under more lower-exposure options"
          : HIDDEN[outside.hidden[r.id] ?? "no-comparison"];
    const imp = fastest.exposure > 0 ? (fastest.exposure - r.exposure) / fastest.exposure : 0;
    const extra = (r.durationSec - fastest.durationSec) / 60;
    const inBudget = rec.eligible.some((e) => e.id === r.id);
    const outcome =
      r.id === rec.recommended.id
        ? r.id === fastest.id
          ? `selected: fastest (${rec.reason})`
          : "selected by recommendation algorithm"
        : r.id === fastest.id
          ? "fastest (baseline)"
          : r.coverage !== "covered"
            ? `no comparison: ${r.coverage}`
            : !inBudget
              ? `outside time budget (+${extra.toFixed(1)} > +${extraMin} min)`
              : imp < C.minImprovement
                ? `<${Math.round(C.minImprovement * 100)}% exposure improvement`
                : "eligible; another route has lower exposure";
    return {
      candidate: name(c),
      min: +(r.durationSec / 60).toFixed(1),
      extraMin: +extra.toFixed(1),
      km: +(r.distanceMeters / 1000).toFixed(2),
      exposure: Math.round(r.exposure),
      improvementPct: Math.round(imp * 100),
      overlapWithFastestPct: Math.round(routeOverlap(r.path, fastest.path) * 100),
      outcome,
      display,
    };
  });
  const notCandidates = [
    ...(trace?.requests ?? [])
      .filter((q) => q.status !== "ok")
      .map((q) => ({
        candidate: q.label,
        outcome:
          q.status === "over-max-time"
            ? `beyond the largest extra-time setting (+${C.extraTime.max} min): ${Math.round(((q.durationSec ?? 0) - fastest.durationSec) / 60)} min slower`
            : q.status === "no-route"
              ? "Google returned no route"
              : q.status === "error"
                ? `Google request failed: ${q.detail ?? ""}`
                : q.status.replace(/-/g, " ") + (q.detail ? ` (${q.detail})` : ""),
      })),
    ...(trace?.duplicates ?? []).map((d) => ({
      candidate: d.dropped,
      outcome: `duplicate geometry of ${d.keptAs} (${d.overlapPct}% shared)`,
    })),
  ];
  return {
    reason: rec.reason,
    budgetMin: extraMin,
    strategy: trace?.strategy,
    thresholds: trace?.thresholds,
    crossings: trace?.crossings,
    corridors: trace?.corridors,
    rows,
    notCandidates,
  };
}

export function logRouteDebug(info: ReturnType<typeof explainRecommendation>) {
  if (!routeDebugEnabled) return;
  (window as Window & { __arazulRouteDebug?: unknown }).__arazulRouteDebug = info;
  console.groupCollapsed(
    `[ARAZUL routing] ${info.reason} · ${info.rows.length} candidates · strategy: ${info.strategy ?? "none"}`,
  );
  if (info.crossings?.length) console.table(info.crossings);
  if (info.corridors?.length) console.table(info.corridors);
  console.table(info.rows);
  if (info.notCandidates.length) console.table(info.notCandidates);
  console.groupEnd();
}
