import { useI18n } from "@/i18n";
import { RouteComparison } from "@/components/RouteComparison";
import { RouteCard } from "@/components/RouteCard";
import { TravelModeToggle, modeIcons } from "@/components/TravelModeToggle";
import { DepartureTimePicker } from "@/components/DepartureTimePicker";
import { DetourBudgetSlider } from "@/components/DetourBudgetSlider";
import type { Recommendation, ScoredRoute, SearchRequest } from "@/types/route";
import type { TravelMode } from "@/types/risk";
import { Button } from "@/components/ui/button";

interface Props {
  rec: Recommendation;
  form: SearchRequest;
  selectedId: string;
  onSelect: (id: string) => void;
  onStart: () => void;
  onWhy: () => void;
  onBack: () => void;
  onMode: (m: TravelMode) => void;
  onHour: (h: number | null) => void;
  extra: number;
  setExtra: (n: number) => void;
  feedback: string | null;
}

const mins = (r: ScoredRoute) => Math.max(1, Math.round(r.durationSec / 60));
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function NavigationPage({ rec, form, selectedId, onSelect, onStart, onWhy, onBack, onMode, onHour, extra, setExtra, feedback }: Props) {
  const { t } = useI18n();
  const others = rec.eligible.filter((r) => r.id !== rec.recommended.id && r.id !== rec.fastest.id).slice(0, 2);
  const same = rec.recommended.id === rec.fastest.id;
  const options: { route: ScoredRoute; kind: "recommended" | "fastest" | "alternative" }[] = [
    { route: rec.recommended, kind: "recommended" },
    ...(same ? [] : [{ route: rec.fastest, kind: "fastest" as const }]),
    ...others.map((route) => ({ route, kind: "alternative" as const })),
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onBack} className="flex h-11 items-center gap-1 rounded-lg pr-3 text-sm font-semibold text-primary hover:bg-secondary">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" /></svg>{t("back")}
        </Button>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-sm font-semibold text-foreground">→ {form.destination.label}</p>
          <p className="flex items-center justify-end gap-1 text-xs text-text-secondary">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>{modeIcons[form.mode]}</svg>
            {t(form.mode)} · {form.departureHour === null ? t("leavingNow") : hourLabel(form.departureHour)}
          </p>
        </div>
      </div>

      <div role="radiogroup" aria-label={t("routes")} className="flex gap-1.5 overflow-x-auto rounded-xl bg-muted p-1">
        {options.map(({ route, kind }) => {
          const on = selectedId === route.id;
          return (
            <button key={route.id} type="button" role="radio" aria-checked={on} onClick={() => onSelect(route.id)}
              className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-2 py-1.5 transition-all ${on ? "bg-card text-primary shadow-soft" : "text-text-secondary hover:text-foreground"}`}>
              <span className="font-display text-base font-extrabold">{mins(route)} {t("min")}</span>
              <span className="truncate text-[11px] font-semibold uppercase">{t(kind)}</span>
            </button>
          );
        })}
      </div>

      <RouteComparison rec={rec} budget={extra} />
      {feedback && <p role="status" className="fade-up text-center text-sm font-medium text-primary">{feedback}</p>}
      {options.map(({ route, kind }) => (
        <RouteCard key={route.id} route={route} kind={kind} fastest={rec.fastest} selected={selectedId === route.id}
          onSelect={() => onSelect(route.id)} onStart={kind === "recommended" ? onStart : undefined} onWhy={kind === "recommended" ? onWhy : undefined} />
      ))}
      <div className="space-y-4 border-t pt-5">
        <TravelModeToggle value={form.mode} onChange={onMode} />
        <DepartureTimePicker value={form.departureHour} onChange={onHour} />
        <DetourBudgetSlider value={extra} onChange={setExtra} />
      </div>
    </div>
  );
}
