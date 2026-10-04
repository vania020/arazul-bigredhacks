import type { ReactNode } from "react";
import { planningCopy } from "@/i18n/planning";
import { useI18n } from "@/i18n";
import { LocationSearch } from "@/components/LocationSearch";
import { TravelModeToggle } from "@/components/TravelModeToggle";
import { DepartureTimePicker } from "@/components/DepartureTimePicker";
import { DetourBudgetSlider } from "@/components/DetourBudgetSlider";
import { SheetSection } from "@/components/SheetSection";
import type { SearchRequest } from "@/types/route";
import { Button } from "@/components/ui/button";

interface Props {
  form: SearchRequest;
  setForm: (f: SearchRequest) => void;
  extra: number;
  setExtra: (n: number) => void;
  mapsReady: boolean;
  onSubmit: () => void;
  onDemo: () => void;
  error: string | null;
  timeComparison?: ReactNode;
  onPick?: ((kind: "origin" | "destination") => void) | undefined;
  /**
   * "panel" (desktop): trip card, mode and a visible time budget in one column.
   * "sheet" (phone): the trip card and mode float over the map; the sheet holds the rest.
   */
  layout?: "panel" | "sheet";
}

/** Origin and destination in one floating card, with swap beside it (reference style). */
export function TripCard({
  form,
  setForm,
  mapsReady,
  onPick,
}: Pick<Props, "form" | "setForm" | "mapsReady" | "onPick">) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1 rounded-2xl border bg-card p-1.5 shadow-soft">
        <span
          aria-hidden
          className="pointer-events-none absolute left-[22px] top-[44px] h-[22px] border-l-2 border-dotted border-primary/50"
        />
        <LocationSearch
          id="origin"
          kind="origin"
          variant="inline"
          value={form.origin}
          onChange={(origin) => setForm({ ...form, origin })}
          mapsReady={mapsReady}
          onPick={onPick ? () => onPick("origin") : undefined}
          allowCurrent
        />
        <div className="ml-10 mr-2 border-t" aria-hidden />
        <LocationSearch
          id="destination"
          kind="destination"
          variant="inline"
          value={form.destination}
          onChange={(destination) => setForm({ ...form, destination })}
          mapsReady={mapsReady}
          onPick={onPick ? () => onPick("destination") : undefined}
        />
      </div>
      <button
        type="button"
        aria-label={t("swap")}
        title={t("swap")}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border bg-card text-primary shadow-soft hover:bg-secondary"
        onClick={() => setForm({ ...form, origin: form.destination, destination: form.origin })}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="M8 4v16M8 4 4.5 7.5M8 4l3.5 3.5M16 20V4m0 16-3.5-3.5M16 20l3.5-3.5" />
        </svg>
      </button>
    </div>
  );
}

export function SearchPage({
  form,
  setForm,
  extra,
  setExtra,
  mapsReady,
  onSubmit,
  onDemo,
  error,
  timeComparison,
  onPick,
  layout = "panel",
}: Props) {
  const { t, lang } = useI18n();
  const copy = planningCopy[lang];
  const panel = layout === "panel";
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {panel && <TripCard form={form} setForm={setForm} mapsReady={mapsReady} onPick={onPick} />}
      {panel && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            {t("mode")}
          </p>
          <TravelModeToggle value={form.mode} onChange={(mode) => setForm({ ...form, mode })} />
        </div>
      )}
      {panel && (
        <div className="rounded-2xl border bg-card px-4 py-3 shadow-soft">
          <DetourBudgetSlider value={extra} onChange={setExtra} compact />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-secondary p-3 text-sm text-deep">
          {error}
        </p>
      )}
      <div className="space-y-1">
        <Button
          type="submit"
          className="h-14 w-full rounded-2xl font-display text-base font-bold shadow-float hover:bg-deep"
        >
          {t("findRoutes")} <span aria-hidden>→</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDemo}
          className="h-11 w-full rounded-2xl text-sm font-semibold text-primary hover:bg-secondary"
        >
          {t("demoTrip")} <span aria-hidden>↗</span>
        </Button>
      </div>
      <SheetSection title={panel ? copy.advanced : `${copy.advanced} · ${extra} ${copy.extra}`}>
        <div className="space-y-4">
          <DepartureTimePicker
            value={form.departureHour}
            onChange={(departureHour) => setForm({ ...form, departureHour })}
          />
          {!panel && <DetourBudgetSlider value={extra} onChange={setExtra} />}
          {timeComparison}
        </div>
      </SheetSection>
    </form>
  );
}
