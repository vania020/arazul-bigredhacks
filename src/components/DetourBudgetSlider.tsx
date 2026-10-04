import { EXPOSURE_CONFIG as C } from "@/config/exposureConfig";
import { useI18n } from "@/i18n";

/** Extra-time preference. `compact`: helper sentence kept for screen readers only. */
export function DetourBudgetSlider({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor="extra" className="text-sm font-semibold text-foreground">
          {t("maxExtra")}
        </label>
        <span className="font-display text-lg font-extrabold text-primary">
          +{value} {t("min")}
        </span>
      </div>
      <input
        id="extra"
        type="range"
        min={C.extraTime.min}
        max={C.extraTime.max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-primary"
        aria-valuetext={`+${value} min`}
        aria-describedby="extra-help"
      />
      <p
        id="extra-help"
        className={compact ? "sr-only" : "text-sm leading-snug text-text-secondary"}
      >
        {t("extraHelper")}
      </p>
    </div>
  );
}
