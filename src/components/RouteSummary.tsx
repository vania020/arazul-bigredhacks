import { Macaw } from "./brand/Macaw";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n";
import { navigationCopy } from "@/i18n/navigation";
import { routeUiCopy } from "@/i18n/routeUi";
import type { ScoredRoute } from "@/types/route";
import { Button } from "@/components/ui/button";
import { fmtLen } from "./RouteCard";
import { routeFacts, useKindLabel, type RouteKind } from "./routeFacts";

const icon = (d: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {d}
  </svg>
);
const ICONS = {
  down: icon(<path d="M5 20V12M12 20V8M19 20v-4" />),
  clock: icon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
  ),
  segment: icon(
    <>
      <path d="M4 18c4 0 4-12 8-12s4 12 8 12" />
      <circle cx="12" cy="6" r="1.6" fill="currentColor" />
    </>,
  ),
  info: icon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>,
  ),
  nav: (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M21 3 3 10.5l7.5 2.9L13.4 21z" />
    </svg>
  ),
  list: icon(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />),
};

/**
 * The selected route, reference-style: big time + badge, distance, existing exposure/time
 * metrics as tiles, then the primary action. Every number comes from the scored route.
 */
export function RouteSummary({
  route,
  kind,
  fastest,
  comparisonAvailable,
  onStart,
  onOtherOptions,
  onWhy,
}: {
  route: ScoredRoute;
  kind: RouteKind;
  fastest: ScoredRoute;
  comparisonAvailable: boolean;
  onStart: () => void;
  onOtherOptions?: (() => void) | undefined;
  onWhy?: (() => void) | undefined;
}) {
  const { t, lang } = useI18n();
  const nav = navigationCopy[lang];
  const ui = routeUiCopy[lang];
  const kindLabel = useKindLabel();
  const { extra, pct, isFastest, minutes } = routeFacts(route, fastest);
  return (
    <section
      aria-label={ui.selectedRoute}
      className="relative fade-up @container rounded-3xl border bg-card p-4 shadow-soft"
    >
      {kind === "recommended" && (
        <Macaw className="absolute right-4 top-14 h-20 w-20" label="Ara" />
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <p className="whitespace-nowrap font-display text-4xl font-extrabold leading-none tracking-tight text-foreground">
            {minutes} {t("min")}
          </p>
          <p className="mt-1.5 text-sm font-medium text-text-secondary">
            {(route.distanceMeters / 1000).toFixed(1)} km
          </p>
        </div>
        <span
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${kind === "recommended" ? "bg-success-soft text-success" : "bg-muted text-text-secondary"}`}
        >
          {kind === "recommended" && (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.4-5.4 1.4 1.4z" />
            </svg>
          )}
          {kindLabel(kind)}
        </span>
      </div>

      <p
        className={`mt-4 text-sm leading-relaxed text-text-secondary ${kind === "recommended" ? "pr-20" : ""}`}
      >
        {!comparisonAvailable
          ? t("noExposure")
          : !isFastest && pct > 0
            ? t("routeSimpleLower")
            : isFastest
              ? t("routeSimpleFast")
              : t("routeSimpleAlternative")}
      </p>
      {comparisonAvailable && pct > 0 && (
        <p className="mt-3 rounded-2xl bg-success-soft px-4 py-3 text-sm font-bold text-success">
          {t("reducedBy", { pct })}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-foreground">
        {ICONS.clock}
        {isFastest ? t("fastestOption") : t("vsFastest", { min: Math.max(0, extra) })}
      </div>

      <div
        className={`mt-4 grid grid-cols-1 gap-2 ${onOtherOptions ? "@min-[19rem]:grid-cols-[1.35fr_1fr]" : ""}`}
      >
        <Button
          onClick={onStart}
          className="h-14 min-w-0 rounded-2xl px-3 font-display text-base font-bold shadow-float hover:bg-deep"
        >
          {ICONS.nav}
          {nav.start}
        </Button>
        {onOtherOptions && (
          <Button
            variant="outline"
            onClick={onOtherOptions}
            className="h-14 min-w-0 rounded-2xl px-2 text-sm font-semibold text-primary hover:bg-secondary"
          >
            {ICONS.list}
            {ui.otherOptions}
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-col items-start gap-1">
        {onWhy && (
          <button
            type="button"
            onClick={onWhy}
            className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {ICONS.info}
            {t("whyRoute")}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Collapsed phone sheet: the selected route at a glance (time, type, exposure) and Start
 * navigation, so the map can take almost the whole screen.
 */
export function RoutePeek({
  route,
  kind,
  fastest,
  comparisonAvailable,
  onStart,
}: {
  route: ScoredRoute;
  kind: RouteKind;
  fastest: ScoredRoute;
  comparisonAvailable: boolean;
  onStart: () => void;
}) {
  const { t, lang } = useI18n();
  const nav = navigationCopy[lang];
  const kindLabel = useKindLabel();
  const { extra, pct, isFastest, minutes } = routeFacts(route, fastest);
  const good = comparisonAvailable && !isFastest && pct > 0;
  const exposure = !comparisonAvailable
    ? t("noExposure")
    : good
      ? t("routeSimpleLower")
      : isFastest
        ? t("fastestOption")
        : t("routeSimpleAlternative");
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="whitespace-nowrap font-display text-2xl font-extrabold leading-tight text-foreground">
            {minutes} {t("min")}
          </span>
          <span
            className={`truncate text-[11px] font-bold uppercase tracking-wide ${kind === "recommended" ? "text-primary" : "text-text-secondary"}`}
          >
            {kindLabel(kind)}
          </span>
        </p>
        <p
          className={`truncate text-xs font-semibold ${good ? "text-success" : "text-text-secondary"}`}
        >
          {exposure}
          {!isFastest && ` · ${t("vsFastest", { min: Math.max(0, extra) })}`}
        </p>
      </div>
      <Button
        onClick={onStart}
        className="h-12 shrink-0 rounded-2xl px-4 font-display text-sm font-bold shadow-float hover:bg-deep"
      >
        {ICONS.nav}
        {nav.start}
      </Button>
    </div>
  );
}
