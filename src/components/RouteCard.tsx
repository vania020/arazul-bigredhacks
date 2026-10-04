import { Clock3, Route, ShieldCheck, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n";
import type { ScoredRoute } from "@/types/route";
import { routeFacts, useKindLabel, type RouteKind } from "./routeFacts";

export const fmtLen = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;

interface Props {
  route: ScoredRoute;
  kind: RouteKind;
  fastest: ScoredRoute;
  selected: boolean;
  onSelect: () => void;
  comparisonAvailable?: boolean;
}

/** Compact route option (the "Other options" list): tap to select it. */
export function RouteCard({
  route,
  kind,
  fastest,
  selected,
  onSelect,
  comparisonAvailable = true,
}: Props) {
  const { t } = useI18n();
  const kindLabel = useKindLabel();
  const { extra, pct, isFastest, minutes } = routeFacts(route, fastest);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-all ${selected ? "border-primary ring-2 ring-primary/20" : "hover:border-sky"}`}
    >
      <span
        aria-hidden
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${kind === "recommended" ? "bg-success-soft text-success" : kind === "fastest" ? "bg-secondary text-primary" : "bg-muted text-text-secondary"}`}
      >
        {kind === "recommended" ? (
          <ShieldCheck className="h-5 w-5" />
        ) : kind === "fastest" ? (
          <Clock3 className="h-5 w-5" />
        ) : (
          <Route className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-xl font-extrabold text-foreground">
            {minutes} {t("min")}
          </span>
          {!isFastest && (
            <span className="text-sm font-semibold text-text-secondary">
              +{Math.max(0, extra)} {t("min")}
            </span>
          )}
          <span className="text-sm text-text-secondary">
            · {(route.distanceMeters / 1000).toFixed(1)} km
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-secondary">
          {isFastest
            ? t("fastestOption")
            : comparisonAvailable && pct > 0
              ? t("routeSimpleLower")
              : comparisonAvailable
                ? t("routeSimpleAlternative")
                : t("noExposure")}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${kind === "recommended" ? "bg-secondary text-primary" : "bg-muted text-text-secondary"}`}
      >
        {kindLabel(kind)}
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-text-secondary" />
    </button>
  );
}
