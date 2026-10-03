import type { ReactNode } from "react";
import { planningCopy } from "@/i18n/planning";
import { useI18n } from "@/i18n";
import { LocationSearch } from "@/components/LocationSearch";
import { TravelModeToggle } from "@/components/TravelModeToggle";
import { DepartureTimePicker } from "@/components/DepartureTimePicker";
import { DetourBudgetSlider } from "@/components/DetourBudgetSlider";
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
  onPick?: (kind: "origin" | "destination") => void;
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
}: Props) {
  const { t, lang } = useI18n();
  const copy = planningCopy[lang];
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative space-y-3">
        <LocationSearch
          id="origin"
          kind="origin"
          value={form.origin}
          onChange={(origin) => setForm({ ...form, origin })}
          mapsReady={mapsReady}
          onPick={onPick ? () => onPick("origin") : undefined}
          allowCurrent
        />
        <LocationSearch
          id="destination"
          kind="destination"
          value={form.destination}
          onChange={(destination) => setForm({ ...form, destination })}
          mapsReady={mapsReady}
          onPick={onPick ? () => onPick("destination") : undefined}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{t("mode")}</p>{" "}
          <button
            type="button"
            className="min-h-10 text-xs font-semibold text-primary"
            onClick={() => setForm({ ...form, origin: form.destination, destination: form.origin })}
          >
            {t("swap")} ↕
          </button>
        </div>
        <TravelModeToggle value={form.mode} onChange={(mode) => setForm({ ...form, mode })} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-secondary p-3 text-sm text-deep">
          {error}
        </p>
      )}
      <div className="space-y-2">
        <Button
          type="submit"
          className="h-13 w-full rounded-lg font-display text-base font-bold shadow-soft hover:bg-deep"
        >
          {t("findRoutes")} <span aria-hidden>→</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDemo}
          className="h-11 w-full rounded-lg text-sm font-semibold text-primary hover:bg-secondary"
        >
          {t("demoTrip")} <span aria-hidden>↗</span>
        </Button>
      </div>
      {timeComparison}
      <details className="rounded-xl border p-3">
        <summary className="min-h-8 cursor-pointer text-sm font-semibold">
          {copy.advanced} · {extra} {copy.extra}
        </summary>
        <div className="space-y-4 pt-3">
          <DepartureTimePicker
            value={form.departureHour}
            onChange={(departureHour) => setForm({ ...form, departureHour })}
          />
          <DetourBudgetSlider value={extra} onChange={setExtra} />
        </div>
      </details>
    </form>
  );
}
