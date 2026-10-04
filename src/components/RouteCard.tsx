import { useI18n } from "@/i18n";
import { navigationCopy } from "@/i18n/navigation";
import type { ScoredRoute } from "@/types/route";
import { Button } from "@/components/ui/button";

export const fmtLen = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;

interface Props {
  route: ScoredRoute;
  kind: "recommended" | "fastest" | "alternative";
  fastest: ScoredRoute;
  selected: boolean;
  onSelect: () => void;
  onStart?: (() => void) | undefined;
  onOpenExternal?: (() => void) | undefined;
  onWhy?: (() => void) | undefined;
  comparisonAvailable?: boolean;
}

/** Primary info: time, extra vs fastest, relative exposure reduction, elevated-exposure distance. Raw index lives in "Why this route?". */
export function RouteCard({
  route,
  kind,
  fastest,
  selected,
  onSelect,
  onStart,
  onOpenExternal,
  onWhy,
  comparisonAvailable = true,
}: Props) {
  const { t, lang } = useI18n();
  const nav = navigationCopy[lang];
  const extra = Math.round((route.durationSec - fastest.durationSec) / 60);
  const pct =
    fastest.exposure > 0
      ? Math.round(((fastest.exposure - route.exposure) / fastest.exposure) * 100)
      : 0;
  const isFastest = route.id === fastest.id;
  return (
    <article
      className={`rounded-lg border bg-card p-4 transition-all ${selected ? "border-primary bg-sky-soft/40 ring-2 ring-primary/25 shadow-soft" : "hover:border-sky"}`}
    >
      <Button
        variant="ghost"
        onClick={onSelect}
        aria-pressed={selected}
        className="block h-auto w-full whitespace-normal rounded-none p-0 text-left hover:bg-transparent"
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`rounded px-2.5 py-1 text-xs font-bold uppercase ${kind === "recommended" ? "bg-secondary text-primary" : "bg-muted text-text-secondary"}`}
          >
            {kind === "recommended" ? `ARAZUL ${t("recommended")}` : t(kind)}
          </span>
          <span
            className={`h-1.5 w-10 rounded-full ${selected ? "bg-route-recommended" : "bg-route-fastest opacity-60"}`}
            aria-hidden
          />
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-display text-3xl font-extrabold text-foreground">
            {Math.max(1, Math.round(route.durationSec / 60))} {t("min")}
          </span>
          {!isFastest && (
            <span className="text-base font-semibold text-text-secondary">
              +{Math.max(0, extra)} {t("min")}
            </span>
          )}
          <span className="ml-auto text-sm text-text-secondary">
            {(route.distanceMeters / 1000).toFixed(1)} km
          </span>
        </div>
        <div className="mt-1 space-y-0.5 text-sm">
          {isFastest ? (
            <p className="text-text-secondary">{t("fastestOption")}</p>
          ) : comparisonAvailable && pct > 0 ? (
            <p className="font-semibold text-primary">{t("reducedBy", { pct })}</p>
          ) : null}
          <p className="text-xs text-text-secondary">
            {comparisonAvailable
              ? t("elevatedKm", { km: fmtLen(route.hotspotMeters) })
              : t("noExposure")}
          </p>
        </div>
      </Button>
      {onStart && (
        <p className="mt-3 text-xs leading-relaxed text-text-secondary">{nav.startHint}</p>
      )}
      {(onStart || onWhy) && (
        <div className="mt-3 flex gap-2">
          {onStart && (
            <Button
              onClick={onStart}
              className="h-11 flex-1 rounded-md px-2 text-sm font-semibold hover:bg-deep"
            >
              {nav.start}
            </Button>
          )}
          {onWhy && (
            <Button
              variant="outline"
              onClick={onWhy}
              className="h-11 flex-1 rounded-md px-2 text-sm font-semibold text-deep hover:bg-secondary"
            >
              {t("whyRoute")}
            </Button>
          )}
        </div>
      )}
      {onOpenExternal && (
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          <button
            type="button"
            onClick={onOpenExternal}
            className="min-h-8 font-semibold text-primary underline-offset-4 hover:underline"
          >
            {nav.openGoogle} ↗
          </button>{" "}
          {t("googleHandoff")}
        </p>
      )}
    </article>
  );
}
