import { useI18n } from "@/i18n";
import { hasExposureComparison } from "@/services/exposureService";
import { useCountUp } from "./useCountUp";
import { Macaw } from "./brand/Macaw";
import type { Recommendation } from "@/types/route";

/** Arazul's verdict for this trip, as a compact mascot "insight" (same messages as before). */
export function RouteComparison({ rec, budget }: { rec: Recommendation; budget: number }) {
  const { t } = useI18n();
  const pct = useCountUp(Math.round(rec.improvement * 100));
  if (!hasExposureComparison(rec))
    return (
      <section aria-label={t("routes")} className="flex gap-3 rounded-2xl bg-muted p-4">
        <svg
          viewBox="0 0 24 24"
          className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("noExposure")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            {t(
              rec.reason === "outside-coverage"
                ? "outsideCoverage"
                : rec.reason === "unsupported-mode"
                  ? "unsupportedMode"
                  : "dataUnavailable",
            )}
          </p>
        </div>
      </section>
    );
  const improved = rec.reason === "improved";
  return (
    <section
      aria-label={t("routes")}
      className="fade-up flex items-center gap-3 rounded-2xl border bg-gradient-to-br from-secondary to-card p-3 pr-4"
    >
      <Macaw className="h-14 w-14 shrink-0" />
      <div className="min-w-0">
        {improved ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              {t("lowerAvailable")}
            </p>
            <p className="mt-0.5 font-display text-lg font-extrabold leading-tight text-deep">
              +{rec.extraMin} {t("min")} · {t("reducedBy", { pct })}
            </p>
            <p className="mt-1 text-xs leading-snug text-text-secondary">
              {t("budgetSentence", { budget })}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-base font-extrabold leading-snug text-deep">
              {t("fastestIsBest")}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-text-secondary">{t("notMeaningful")}</p>
          </>
        )}
      </div>
    </section>
  );
}
