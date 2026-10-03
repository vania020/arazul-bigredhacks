import { CATEGORY_WEIGHTS } from "@/config/exposureConfig";
import { useI18n } from "@/i18n";
import { Modal } from "./Modal";
import type { RiskGrid } from "@/types/risk";

export function MethodologyModal({
  open,
  onClose,
  grid,
}: {
  open: boolean;
  onClose: () => void;
  grid: RiskGrid | null;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t("methodology")}>
      <p className="text-sm text-text-secondary">
        {grid?.meta.methodology ?? (grid ? t("methodologyIntro") : t("dataUnavailable"))}
      </p>
      {grid?.meta.timeResolution === "all-day" && (
        <p className="mt-3 text-sm">{t("monthlyData")}</p>
      )}
      {grid?.meta.sourceUrl && (
        <a
          className="mt-3 inline-block text-sm text-primary underline"
          href={grid.meta.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {grid.meta.source}
        </a>
      )}
      {grid?.meta.limitations && (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {grid.meta.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {grid && <p className="mt-3 text-xs">{t("withinCity")}</p>}
      {grid?.meta.cityId === "sao-paulo" && (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-text-secondary">
              <tr>
                <th className="p-2">{t("category")}</th>
                <th className="p-2">{t("severity")}</th>
                <th className="p-2">{t("walking")}</th>
                <th className="p-2">{t("driving")}</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_WEIGHTS.map((w) => (
                <tr key={w.category} className="border-t">
                  <td className="p-2">{w.category}</td>
                  <td className="p-2">{w.severity}</td>
                  <td className="p-2">{w.walking.toFixed(1)}</td>
                  <td className="p-2">{w.driving.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm font-semibold text-deep">{t("methodologyNote")}</p>
      {grid && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("dataSource", {
            source: grid.meta.source,
            period: grid.meta.period,
            n: grid.meta.incidentsUsed.toLocaleString(),
          })}
        </p>
      )}
    </Modal>
  );
}
