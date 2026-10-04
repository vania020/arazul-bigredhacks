import { useI18n } from "@/i18n";
import type { Recommendation, ScoredRoute } from "@/types/route";

/** Presentation helpers shared by the desktop panel and the phone sheet (no routing logic). */
export type RouteKind = "recommended" | "fastest" | "alternative";

/** Badge text for a route kind (switcher, summary and option rows). */
export function useKindLabel() {
  const { t } = useI18n();
  return (kind: RouteKind) => (kind === "recommended" ? `ARAZUL ${t("recommended")}` : t(kind));
}

/** Same derived numbers the cards always showed: extra minutes and exposure change vs fastest. */
export function routeFacts(route: ScoredRoute, fastest: ScoredRoute) {
  return {
    extra: Math.round((route.durationSec - fastest.durationSec) / 60),
    pct:
      fastest.exposure > 0
        ? Math.round(((fastest.exposure - route.exposure) / fastest.exposure) * 100)
        : 0,
    isFastest: route.id === fastest.id,
    minutes: Math.max(1, Math.round(route.durationSec / 60)),
  };
}

/**
 * The route options shown to the user (unchanged selection: recommended, fastest, and up to two
 * other eligible routes with the selected one first) and the currently selected option.
 */
export function routeOptions(rec: Recommendation, selectedId: string) {
  const others = rec.eligible
    .filter((r) => r.id !== rec.recommended.id && r.id !== rec.fastest.id)
    .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
    .slice(0, 2);
  const same = rec.recommended.id === rec.fastest.id;
  const options: { route: ScoredRoute; kind: RouteKind }[] = [
    { route: rec.recommended, kind: "recommended" },
    ...(same ? [] : [{ route: rec.fastest, kind: "fastest" as const }]),
    ...others.map((route) => ({ route, kind: "alternative" as const })),
  ];
  const current = options.find((o) => o.route.id === selectedId) ?? options[0]!;
  return { options, current };
}
