import { ShieldCheck, Clock3 } from "lucide-react";
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
    <section className="rounded-3xl border bg-card p-4 shadow-soft" aria-label={t("planRoute")}>
      <h2 className="mb-3 font-display text-xl font-extrabold text-deep">{t("planRoute")}</h2>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 rounded-2xl border bg-background p-1.5">
          <span
            aria-hidden
            className="pointer-events-none absolute left-[22px] top-[36px] h-[44px] border-l-2 border-dotted border-primary/50"
          />
          <LocationSearch
            id="origin"
            kind="origin"
            variant="inline"
            showPickLabel
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
            showPickLabel
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-secondary text-primary shadow-soft hover:bg-secondary"
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
    </section>
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
  onPick,
  layout = "panel",
}: Props) {
  const { t, lang } = useI18n();
  const copy = planningCopy[lang];
  const panel = layout === "panel";
  return (
    <form
      className="space-y-3"
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
          <p className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
            <Clock3 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("budgetHint", { min: extra })}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-secondary p-3 text-sm text-deep">
          {error}
        </p>
      )}
      <div className="relative space-y-1">
        <Button
          type="submit"
          className="h-12 w-full rounded-full pr-16 font-display text-base font-bold shadow-float hover:bg-deep"
        >
          {t("findRoutes")} <span aria-hidden>→</span>
        </Button>
      </div>
      <div className="relative pt-1">
        <img
          src="/ara-sunny-mound.png"
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute -right-2 -top-16 z-10 h-24 w-24 object-contain"
        />
        <div className="relative flex items-start gap-3 overflow-hidden rounded-2xl border border-success/20 bg-gradient-to-br from-success-soft via-success-soft to-card px-4 py-4 shadow-soft">
          <div aria-hidden className="absolute -bottom-5 -left-3 flex items-end gap-1 opacity-30">
            <span className="h-10 w-7 -rotate-45 rounded-full bg-success" />
            <span className="h-8 w-6 rotate-12 rounded-full bg-success" />
            <span className="h-6 w-8 rotate-45 rounded-full bg-success" />
          </div>
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success text-white shadow-sm">
            <ShieldCheck aria-hidden className="h-7 w-7" />
          </span>
          <div className="relative min-w-0 flex-1 pr-3">
            <p className="text-sm font-bold leading-snug text-deep">{t("routeHelpTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{t("routeHelpBody")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDemo}
          className="mx-auto mt-1 block min-h-11 rounded-lg px-3 text-xs font-medium text-text-secondary underline underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t("demoTrip")}
        </button>
      </div>
      <SheetSection title={panel ? copy.advanced : `${copy.advanced} · ${extra} ${copy.extra}`}>
        <div className="space-y-4">
          <DepartureTimePicker
            value={form.departureHour}
            onChange={(departureHour) => setForm({ ...form, departureHour })}
          />
          {!panel && <DetourBudgetSlider value={extra} onChange={setExtra} />}
        </div>
      </SheetSection>
    </form>
  );
}
