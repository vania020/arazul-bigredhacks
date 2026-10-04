import { useI18n } from "@/i18n";
import type { TravelMode } from "@/types/risk";

export const modeIcons: Record<TravelMode, React.ReactNode> = {
  walking: (
    <path d="M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10 8l-3 3 1.5 1.5L10 11v4l-2 6h2.2l1.8-5 2 2v3h2v-4l-2.5-2.5.5-3 2 2.5h3V12h-2l-2.5-3.5A2 2 0 0 0 12.8 8z" />
  ),
  driving: (
    <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2v2h-2.5v-2h-9v2H5v-2H3v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1-3H8.2zM6.5 15a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm11 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" />
  ),
};

/** Pill-style travel mode choice (only the modes Arazul supports). */
export function TravelModeToggle({
  value,
  onChange,
}: {
  value: TravelMode;
  onChange: (m: TravelMode) => void;
}) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t("mode")} className="grid grid-cols-2 gap-2">
      {(["walking", "driving"] as TravelMode[]).map((m) => {
        const on = value === m;
        return (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m)}
            className={`flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-all ${on ? "border-primary bg-secondary text-primary ring-1 ring-primary shadow-soft" : "bg-card text-text-secondary hover:border-sky hover:text-foreground"}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
              {modeIcons[m]}
            </svg>
            {t(m)}
          </button>
        );
      })}
    </div>
  );
}
