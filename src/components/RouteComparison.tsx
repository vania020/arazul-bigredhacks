import { useI18n } from "@/i18n";
import { useCountUp } from "./useCountUp";
import type { Recommendation } from "@/types/route";

export function RouteComparison({ rec, budget }: { rec: Recommendation; budget: number }) {
  const { t } = useI18n();
  const pct = useCountUp(Math.round(rec.improvement * 100));
  const improved = rec.reason === "improved";
  return (
    <section aria-label={t("routes")} className="fade-up rounded-lg bg-deep p-4 text-primary-foreground shadow-soft">
      {improved ? (
        <>
          <p className="text-sm font-semibold text-sky">{t("lowerAvailable")}</p>
          <p className="mt-1 font-display text-2xl font-extrabold leading-tight">
            +{rec.extraMin} {t("min")} <span className="text-sky">·</span> {t("reducedBy", { pct })}
          </p>
          <p className="mt-2 text-sm leading-snug opacity-85">{t("budgetSentence", { budget })}</p>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-bold leading-snug">{t("fastestIsBest")}</p>
          <p className="mt-1 text-sm leading-snug opacity-85">{t("notMeaningful")}</p>
        </>
      )}
    </section>
  );
}
