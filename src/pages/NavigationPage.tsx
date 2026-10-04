import { useRef, type ReactNode } from "react";
import { planningCopy } from "@/i18n/planning";
import { useI18n } from "@/i18n";
import { navigationCopy } from "@/i18n/navigation";
import { routeUiCopy } from "@/i18n/routeUi";
import { tripToolsText } from "@/i18n/trip-tools";
import { hasExposureComparison } from "@/services/exposureService";
import { RouteComparison } from "@/components/RouteComparison";
import { RouteCard } from "@/components/RouteCard";
import { routeOptions, type RouteKind } from "@/components/routeFacts";
import { RouteSummary } from "@/components/RouteSummary";
import { SheetSection } from "@/components/SheetSection";
import { TravelModeToggle, modeIcons } from "@/components/TravelModeToggle";
import { DepartureTimePicker } from "@/components/DepartureTimePicker";
import { DetourBudgetSlider } from "@/components/DetourBudgetSlider";
import type { Recommendation, ScoredRoute, SearchRequest } from "@/types/route";
import type { TravelMode } from "@/types/risk";

interface Props {
  rec: Recommendation;
  form: SearchRequest;
  selectedId: string;
  onSelect: (id: string) => void;
  onStart: (routeId: string, kind: "recommended" | "fastest" | "alternative") => void;
  onOpenExternal: (routeId: string) => void;
  onWhy: () => void;
  onBack: () => void;
  onMode: (m: TravelMode) => void;
  onHour: (h: number | null) => void;
  extra: number;
  setExtra: (n: number) => void;
  feedback: string | null;
  tripTools?: ReactNode;
  /** Lower-exposure routes outside the time budget (secondary; never the recommendation). */
  lowerExposure?: ReactNode;
  /** Phone: open the sheet fully when the user asks for other options. */
  onExpand?: (() => void) | undefined;
  /**
   * "panel" (desktop side panel): everything in one column.
   * "sheet" (phone bottom sheet): the trip header and route switcher float over the map instead.
   */
  layout?: "panel" | "sheet";
}

const mins = (r: ScoredRoute) => Math.max(1, Math.round(r.durationSec / 60));
const hourLabel = (h: number) =>
  new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const KIND_ICON: Record<RouteKind, ReactNode> = {
  recommended: (
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.4-5.4 1.4 1.4z" />
  ),
  fastest: <path d="M9 2h6v2H9zm3 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm1 8.4V9h-2v6.4l4 2.4 1-1.7z" />,
  alternative: (
    <path d="M6 3a3 3 0 0 0-1 5.8V21h2v-5h4a4 4 0 0 0 4-4V8.8A3 3 0 1 0 13 8.8V12a2 2 0 0 1-2 2H7V8.8A3 3 0 0 0 6 3z" />
  ),
};

/** Back to search + where this trip goes (desktop panel or floating over the phone map). */
export function TripHeader({
  form,
  onBack,
  floating = false,
}: {
  form: SearchRequest;
  onBack: () => void;
  floating?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-1.5 pr-3 shadow-soft ${floating ? "glass" : "bg-card"}`}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-secondary"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {t("back")}
      </button>
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-sm font-semibold text-foreground">→ {form.destination.label}</p>
        <p className="flex items-center justify-end gap-1 overflow-hidden whitespace-nowrap text-xs text-text-secondary">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            {modeIcons[form.mode]}
          </svg>
          {t(form.mode)} ·{" "}
          {form.departureHour === null ? t("leavingNow") : hourLabel(form.departureHour)}
        </p>
      </div>
    </div>
  );
}

/** Route choice pills (the same options and selection behaviour in both layouts). */
export function RouteSwitcher({
  rec,
  selectedId,
  onSelect,
}: {
  rec: Recommendation;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const { options } = routeOptions(rec, selectedId);
  return (
    <div
      role="radiogroup"
      aria-label={t("routes")}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map(({ route, kind }) => {
        const on = selectedId === route.id;
        return (
          <button
            key={route.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(route.id)}
            className={`flex min-w-[6.75rem] flex-1 flex-col items-start rounded-2xl border px-3 py-2 text-left transition-all ${on ? "border-primary bg-primary text-primary-foreground shadow-float" : "bg-card text-foreground shadow-soft hover:border-sky"}`}
          >
            <span className="flex items-center gap-1.5">
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 fill-current ${on ? "" : "text-primary"}`}
                aria-hidden
              >
                {KIND_ICON[kind]}
              </svg>
              <span className="font-display text-base font-extrabold leading-tight">
                {mins(route)} {t("min")}
              </span>
            </span>
            <span className="w-full min-w-0">
              <span
                className={`block truncate text-[10px] font-bold uppercase tracking-wide ${on ? "opacity-90" : "text-text-secondary"}`}
              >
                {t(kind)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NavigationPage({
  rec,
  form,
  selectedId,
  onSelect,
  onStart,
  onOpenExternal,
  onWhy,
  onBack,
  onMode,
  onHour,
  extra,
  setExtra,
  feedback,
  tripTools,
  lowerExposure,
  onExpand,
  layout = "panel",
}: Props) {
  const { t, lang } = useI18n();
  const copy = planningCopy[lang];
  const ui = routeUiCopy[lang];
  const nav = navigationCopy[lang];
  const optionsRef = useRef<HTMLElement>(null);
  const comparisonAvailable = hasExposureComparison(rec);
  const { options, current } = routeOptions(rec, selectedId);
  const showOtherOptions = () => {
    onExpand?.();
    // Let the sheet finish expanding before scrolling the list into view.
    setTimeout(
      () => optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      320,
    );
  };

  return (
    <div className="space-y-4">
      {layout === "panel" && <TripHeader form={form} onBack={onBack} />}
      {layout === "panel" && (
        <RouteSwitcher rec={rec} selectedId={selectedId} onSelect={onSelect} />
      )}

      <RouteSummary
        route={current.route}
        kind={current.kind}
        fastest={rec.fastest}
        comparisonAvailable={comparisonAvailable}
        onStart={() => onStart(current.route.id, current.kind)}
        onOtherOptions={showOtherOptions}
        onWhy={current.kind === "recommended" ? onWhy : undefined}
      />

      <RouteComparison rec={rec} budget={extra} />
      {feedback && (
        <p role="status" className="fade-up text-center text-sm font-medium text-primary">
          {feedback}
        </p>
      )}
      {lowerExposure}

      {/* The time preference stays visible next to the routes it shapes. */}
      <div className="rounded-2xl border bg-card px-4 py-3 shadow-soft">
        <DetourBudgetSlider value={extra} onChange={setExtra} compact />
      </div>

      <section ref={optionsRef} aria-label={ui.otherOptions} className="scroll-mt-4 space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-text-secondary">
          {ui.otherOptions}
        </h2>
        {options
          .filter((o) => o.route.id !== current.route.id)
          .map(({ route, kind }) => (
            <RouteCard
              key={route.id}
              route={route}
              kind={kind}
              fastest={rec.fastest}
              selected={false}
              comparisonAvailable={comparisonAvailable}
              onSelect={() => onSelect(route.id)}
            />
          ))}
        <div className="rounded-2xl border bg-card px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenExternal(current.route.id)}
            className="min-h-9 text-sm font-semibold text-primary hover:underline"
          >
            {nav.openGoogle} ↗
          </button>
          <p className="text-xs leading-relaxed text-text-secondary">{t("googleHandoff")}</p>
        </div>
      </section>

      {tripTools && <SheetSection title={tripToolsText[lang].share}>{tripTools}</SheetSection>}
      <SheetSection title={copy.advanced}>
        <div className="space-y-4">
          <TravelModeToggle value={form.mode} onChange={onMode} />
          <DepartureTimePicker value={form.departureHour} onChange={onHour} />
          <p className="text-xs leading-relaxed text-text-secondary">{t("timeCaveat")}</p>
        </div>
      </SheetSection>
    </div>
  );
}
