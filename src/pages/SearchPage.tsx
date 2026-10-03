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
}

export function SearchPage({ form, setForm, extra, setExtra, mapsReady, onSubmit, onDemo, error }: Props) {
  const { t } = useI18n();
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="relative space-y-3">
        <LocationSearch id="origin" kind="origin" value={form.origin} onChange={(origin) => setForm({ ...form, origin })} mapsReady={mapsReady} allowCurrent />
        <LocationSearch id="destination" kind="destination" value={form.destination} onChange={(destination) => setForm({ ...form, destination })} mapsReady={mapsReady} />
      </div>
      <div className="space-y-2"><p className="text-sm font-semibold text-foreground">{t("mode")}</p><TravelModeToggle value={form.mode} onChange={(mode) => setForm({ ...form, mode })} /></div>
      <DepartureTimePicker value={form.departureHour} onChange={(departureHour) => setForm({ ...form, departureHour })} />
      <DetourBudgetSlider value={extra} onChange={setExtra} />
      {error && <p role="alert" className="rounded-xl bg-secondary p-3 text-sm text-deep">{error}</p>}
      <div className="space-y-2">
        <Button type="submit" className="h-13 w-full rounded-lg font-display text-base font-bold shadow-soft hover:bg-deep">
          {t("findRoutes")} <span aria-hidden>→</span>
        </Button>
        <Button type="button" variant="ghost" onClick={onDemo} className="h-11 w-full rounded-lg text-sm font-semibold text-primary hover:bg-secondary">
          {t("demoTrip")} <span aria-hidden>↗</span>
        </Button>
      </div>
    </form>
  );
}
