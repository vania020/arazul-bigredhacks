import { useMemo } from "react";
import { useI18n } from "@/i18n";
import { timeOfDayCopy } from "@/i18n/time-of-day";
import { compareTimeWindows, TIME_WINDOWS } from "@/services/time-of-day";
import type { CandidateRoute } from "@/types/route";
import type { RiskGrid, TravelMode } from "@/types/risk";
export interface TimeOfDayComparisonProps {
  route: CandidateRoute | null;
  grid: RiskGrid | null;
  mode: TravelMode;
  hour: number;
  timeZone: string;
  onHourChange: (hour: number) => void;
}
export function TimeOfDayComparison({
  route,
  grid,
  mode,
  hour,
  timeZone,
  onHourChange,
}: TimeOfDayComparisonProps) {
  const { lang } = useI18n();
  const copy = timeOfDayCopy[lang];
  const result = useMemo(
    () => compareTimeWindows(route, grid, mode, hour),
    [route, grid, mode, hour],
  );
  const selectable = result.status === "available" || result.status === "choose-route";
  const unavailable = {
    "all-day": copy.allDay,
    unavailable: copy.unavailable,
    "unsupported-mode": copy.unsupported,
    "outside-coverage": copy.outside,
  };
  return (
    <section
      aria-label={copy.title}
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      <div>
        <h2 className="text-sm font-semibold">{copy.title}</h2>
        <p className="text-xs text-muted-foreground">
          {copy.local} · {timeZone}
        </p>
      </div>
      {selectable ? (
        <>
          {result.status === "available" && (
            <p className="text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
          )}
          {result.status === "choose-route" && <p className="text-xs">{copy.choose}</p>}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={copy.title}>
            {TIME_WINDOWS.map((start, i) => {
              const score = result.windows[i];
              const selected = result.currentBucket === i;
              return (
                <button
                  key={start}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onHourChange(start)}
                  className={`${score ? "min-h-20 p-3" : "min-h-14 px-3 py-2"} rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                >
                  <span className="block text-sm font-medium">{copy.names[i]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {String(start).padStart(2, "0")}:00–{String(start + 6).padStart(2, "0")}:00
                  </span>
                  {selected && score && (
                    <span className="block text-xs font-medium mt-1">{copy.current}</span>
                  )}
                  {score && (
                    <>
                      <span className="block text-sm font-semibold mt-2">
                        {copy.index} {score.index.toLocaleString(lang)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="block h-1.5 rounded-full bg-muted my-1.5 overflow-hidden"
                      >
                        <span
                          className="block h-full bg-primary rounded-full"
                          style={{ width: `${score.relativeBar * 100}%` }}
                        />
                      </span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        {score.difference === 0
                          ? copy.equal
                          : `${score.difference > 0 ? "+" : ""}${score.difference.toLocaleString(lang)} ${copy.difference}`}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {result.status === "available" && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{copy.bars}</p>
          )}
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {unavailable[result.status as keyof typeof unavailable]}
        </p>
      )}
    </section>
  );
}
