import { useI18n } from "@/i18n";
import { lowerExposureCopy } from "@/i18n/lowerExposure";
import { fill } from "@/i18n/navigation";
import type { OutsideBudgetOption } from "@/services/outsideBudget";
import { Button } from "@/components/ui/button";

const mins = (sec: number) => Math.max(1, Math.round(sec / 60));

interface Props {
  options: OutsideBudgetOption[];
  budget: number;
  onUse: (option: OutsideBudgetOption) => void;
}

/**
 * Secondary card for a lower-exposure route that exceeds the user's extra-time budget.
 * Informational: the recommendation above still respects the budget; choosing this route is an
 * explicit user decision that also raises the budget to match.
 */
export function LowerExposureOption({ options, budget, onUse }: Props) {
  const { lang } = useI18n();
  const copy = lowerExposureCopy[lang];
  const [featured, ...more] = options;
  if (!featured) return null;
  return (
    <section
      aria-label={copy.title}
      className="rounded-lg border border-dashed bg-card p-4"
      data-testid="lower-exposure-option"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">{copy.title}</p>
      <OptionRow option={featured} budget={budget} onUse={onUse} />
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">{copy.tradeoff}</p>
      {more.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-9 cursor-pointer text-sm font-semibold text-primary">
            {fill(copy.more, { n: more.length })}
          </summary>
          <div className="space-y-3 pt-2">
            {more.map((o) => (
              <div key={o.route.id} className="border-t pt-3">
                <OptionRow option={o} budget={budget} onUse={onUse} />
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function OptionRow({
  option,
  budget,
  onUse,
}: {
  option: OutsideBudgetOption;
  budget: number;
  onUse: (o: OutsideBudgetOption) => void;
}) {
  const { t, lang } = useI18n();
  const copy = lowerExposureCopy[lang];
  return (
    <div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="font-display text-2xl font-extrabold text-foreground">
          {mins(option.route.durationSec)} {t("min")}
        </span>
        <span className="text-sm font-semibold text-text-secondary">
          {fill(copy.vsFastest, { min: option.extraMin })}
        </span>
      </div>
      <p className="text-sm font-semibold text-primary">
        {t("reducedBy", { pct: option.improvementPct })}
      </p>
      <p className="text-xs text-text-secondary">
        {fill(copy.beyond, { over: option.overLimitMin, budget })}
      </p>
      <Button
        variant="outline"
        onClick={() => onUse(option)}
        className="mt-2 h-11 w-full whitespace-normal rounded-md px-2 text-sm font-semibold text-deep hover:bg-secondary"
      >
        {fill(copy.use, { min: option.allowMin })}
      </Button>
    </div>
  );
}
