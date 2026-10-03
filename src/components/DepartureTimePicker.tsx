import { useI18n } from "@/i18n";

export function DepartureTimePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (h: number | null) => void;
}) {
  const { t } = useI18n();
  const custom = value !== null;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-foreground">{t("departure")}</legend>
      <div className="flex gap-2">
        <div role="radiogroup" className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {[false, true].map((c) => (
            <button
              type="button"
              key={String(c)}
              role="radio"
              aria-checked={custom === c}
              onClick={() => onChange(c ? (value ?? 22) : null)}
              className={`h-11 rounded-lg text-sm font-semibold transition-all ${custom === c ? "bg-card text-deep shadow-soft" : "text-text-secondary"}`}
            >
              {c ? t("customTime") : t("now")}
            </button>
          ))}
        </div>
        {custom && (
          <select
            aria-label={t("hour")}
            value={value ?? 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-[52px] rounded-xl border bg-card px-3 font-display text-sm font-bold text-deep"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        )}
      </div>
    </fieldset>
  );
}
