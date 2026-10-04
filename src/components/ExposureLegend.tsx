import { useI18n } from "@/i18n";
import { ExposureInfo } from "./ExposureInfo";

const swatches = ["bg-exp-1", "bg-exp-2", "bg-exp-3", "bg-exp-4", "bg-exp-5", "bg-exp-6"];

export function ExposureLegend() {
  const { t } = useI18n();
  return (
    <div className="glass flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium text-text-secondary shadow-soft">
      <span className="font-semibold text-foreground">{t("layerToggle")}</span>
      <span>{t("lower")}</span>
      <span className="flex h-2 w-20 overflow-hidden rounded-full">
        {swatches.map((s) => (
          <span key={s} className={`flex-1 ${s}`} />
        ))}
      </span>
      <span>{t("higher")}</span>
      <ExposureInfo />
    </div>
  );
}
