import { useI18n } from "@/i18n";
import { hasExposureComparison } from "@/services/exposureService";
import { Modal } from "./Modal";
import { fmtLen } from "./RouteCard";
import type { Recommendation } from "@/types/route";

const mins = (s: number) => Math.max(1, Math.round(s / 60));

export function RouteExplanationSheet({
  open,
  onClose,
  rec,
  budget,
  onMethodology,
}: {
  open: boolean;
  onClose: () => void;
  rec: Recommendation;
  budget: number;
  onMethodology: () => void;
}) {
  const { t } = useI18n();
  const { fastest, recommended: r } = rec;
  const available = hasExposureComparison(rec);
  const same = r.id === fastest.id;
  const cats = Array.from(
    new Set([...Object.keys(fastest.contributors), ...Object.keys(r.contributors)]),
  )
    .map((c) => ({ c, f: fastest.contributors[c] ?? 0, r: r.contributors[c] ?? 0 }))
    .filter((x) => x.f > 0 || x.r > 0)
    .sort((a, b) => Math.max(b.f, b.r) - Math.max(a.f, a.r))
    .slice(0, 5);
  const max = Math.max(1, ...cats.flatMap((x) => [x.f, x.r]));
  return (
    <Modal open={open} onClose={onClose} title={t("whyRoute")}>
      <p className="text-base font-medium leading-snug text-foreground">
        {!available
          ? t(
              rec.reason === "outside-coverage"
                ? "outsideCoverage"
                : rec.reason === "unsupported-mode"
                  ? "unsupportedMode"
                  : "dataUnavailable",
            )
          : same
            ? t("whySame", { budget })
            : t("whySummary", { min: rec.extraMin, pct: Math.round(rec.improvement * 100) })}
      </p>

      <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-text-secondary">
        {t("travelTime")}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <Stat label={t("recommended")} value={`${mins(r.durationSec)} ${t("min")}`} strong />
        {!same && <Stat label={t("fastest")} value={`${mins(fastest.durationSec)} ${t("min")}`} />}
      </dl>
      {available && (
        <>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-text-secondary">
            {t("elevatedSegments")}
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Stat label={t("recommended")} value={fmtLen(r.hotspotMeters)} strong />
            {!same && <Stat label={t("fastest")} value={fmtLen(fastest.hotspotMeters)} />}
          </dl>
        </>
      )}
      {available && cats.length > 0 && (
        <>
          <h3 className="mt-5 font-display text-base font-bold text-deep">{t("contributors")}</h3>
          <p className="text-xs text-text-secondary">{t("contributorsLabel")}</p>
          <ul className="mt-3 space-y-3">
            {cats.map((x) => (
              <li key={x.c}>
                <p className="text-sm font-medium">{x.c}</p>
                <Bar
                  w={x.r / max}
                  cls="bg-route-recommended"
                  label={`${t("recommended")} ${fmtLen(x.r)}`}
                />
                {!same && (
                  <Bar
                    w={x.f / max}
                    cls="bg-route-fastest"
                    label={`${t("fastest")} ${fmtLen(x.f)}`}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-5 rounded-xl bg-muted p-3 text-xs leading-relaxed text-text-secondary">
        {t("disclaimer")}
      </p>
      {available && (
        <details className="mt-3 text-xs text-text-secondary">
          <summary className="cursor-pointer font-semibold">{t("technical")}</summary>
          <p className="mt-1 font-mono">
            {t("recommended")}: {r.index}
            {!same && ` · ${t("fastest")}: ${fastest.index}`}
          </p>
        </details>
      )}
      <button
        onClick={onMethodology}
        className="mt-2 min-h-11 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t("howCalculated")} →
      </button>
    </Modal>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd
        className={`font-display text-lg font-extrabold ${strong ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Bar({ w, cls, label }: { w: number; cls: string; label: string }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-2.5 flex-1 rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${cls}`}
          style={{ width: `${Math.max(2, w * 100)}%` }}
        />
      </div>
      <span className="w-36 shrink-0 text-right text-xs text-text-secondary">{label}</span>
    </div>
  );
}
