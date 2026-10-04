import { ChevronDown, Layers, LocateFixed, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/i18n";
import { fill, type NavCopy } from "@/i18n/navigation";
import { hasExposureComparison } from "@/services/exposureService";
import { arrivalText, distanceText, durationText, type Units } from "@/navigation/format";
import type { RoutePreference } from "@/navigation/reroute";
import type { Progress } from "@/navigation/tracker";
import type { ActiveRoute, NavStatus } from "@/navigation/useNavigation";
import { fmtLen } from "@/components/RouteCard";

interface Props {
  copy: NavCopy;
  status: NavStatus;
  progress: Progress | null;
  active: ActiveRoute;
  preference: RoutePreference;
  prefLabel: string;
  extraMin: number;
  units: Units;
  destination: string;
  startedAt: number;
  arrivedAt: number | null;
  isMobile: boolean;
  /** Desktop: rendered inside the side panel (Recenter then floats on the map). */
  docked?: boolean;
  following: boolean;
  onRecenter: () => void;
  voice: { supported: boolean; muted: boolean; toggle: () => void };
  exposureLayer: { available: boolean; on: boolean; toggle: () => void };
  onEnd: () => void;
}

/** Only statements derivable from the existing scores; nothing here is a new safety claim. */
function whyLines(active: ActiveRoute, copy: NavCopy, preference: RoutePreference, budget: number) {
  const { scored: r, rec } = active;
  const f = rec.fastest;
  const isFastest = r.id === f.id;
  const available = active.comparable && hasExposureComparison(rec) && r.coverage === "covered";
  const lines: string[] = [];
  if (!active.comparable) {
    // A single route (e.g. the rejoin after a custom reroute): nothing was compared, so no
    // "fastest"/"lower exposure" claims — only this route's own scored exposure, if any.
    lines.push(copy.whyOnlyOption);
    if (r.coverage === "covered")
      lines.push(fill(copy.whyElevatedOnly, { km: fmtLen(r.hotspotMeters) }));
  } else {
    if (isFastest) lines.push(copy.whyIsFastest);
    else {
      const extra = Math.round((r.durationSec - f.durationSec) / 60);
      lines.push(extra > 0 ? fill(copy.whyExtra, { min: extra }) : copy.whySameTime);
    }
    if (!available) lines.push(copy.whyNoComparison);
    else if (isFastest) lines.push(fill(copy.whyElevatedOnly, { km: fmtLen(r.hotspotMeters) }));
    else {
      const pct = f.exposure > 0 ? Math.round(((f.exposure - r.exposure) / f.exposure) * 100) : 0;
      lines.push(pct > 0 ? fill(copy.whyReduced, { pct }) : copy.whyNotLower);
      lines.push(
        fill(copy.whyElevated, { km: fmtLen(r.hotspotMeters), fkm: fmtLen(f.hotspotMeters) }),
      );
      lines.push(fill(copy.whyIndex, { index: r.index, findex: f.index }));
    }
  }
  // Only a compared reroute was "compared with the options available where it was recalculated".
  if (active.version > 0 && active.comparable) lines.push(copy.whyRerouted);
  lines.push(
    preference === "recommended"
      ? fill(copy.noteRecommended, { budget })
      : preference === "fastest"
        ? copy.noteFastest
        : copy.noteCustom,
  );
  return { lines, available, isFastest };
}

export function NavigationPanel({
  copy,
  status,
  progress,
  active,
  preference,
  prefLabel,
  extraMin,
  units,
  destination,
  startedAt,
  arrivedAt,
  isMobile,
  docked = false,
  following,
  onRecenter,
  voice,
  exposureLayer,
  onEnd,
}: Props) {
  const { t, lang } = useI18n();
  const { nav, scored, rec } = active;
  const remainingSec = progress?.remainingSec ?? nav.durationSec;
  const remainingM = progress?.remainingM ?? nav.lengthM;
  const why = whyLines(active, copy, preference, extraMin);
  const f = rec.fastest;
  const pct =
    why.available && !why.isFastest && f.exposure > 0
      ? Math.round(((f.exposure - scored.exposure) / f.exposure) * 100)
      : 0;
  const ownExposureOnly = !active.comparable && scored.coverage === "covered";
  const arrived = status === "arrived";
  const shell = docked
    ? "relative rounded-3xl border pb-4 shadow-soft"
    : isMobile
      ? "absolute z-20 inset-x-0 bottom-0 rounded-t-[28px] border-t pb-[max(1rem,env(safe-area-inset-bottom))] shadow-float"
      : "absolute z-20 bottom-5 left-5 w-[420px] rounded-3xl border pb-4 shadow-float";

  return (
    <section aria-label={prefLabel} className={`bg-card px-4 pt-3 ${shell}`}>
      {isMobile && !docked && (
        <span aria-hidden className="mx-auto mb-2 block h-1.5 w-11 rounded-full bg-border" />
      )}
      {!docked && !following && !arrived && status !== "error" && (
        <button
          type="button"
          onClick={onRecenter}
          className="absolute -top-16 right-3 flex h-12 items-center gap-2 rounded-full border bg-card px-4 text-sm font-bold text-primary shadow-float"
        >
          <LocateFixed aria-hidden className="h-5 w-5" />
          {copy.recenter}
        </button>
      )}
      {arrived ? (
        <p className="font-display text-xl font-extrabold text-foreground">
          {fill(copy.summary, {
            min: Math.max(1, Math.round(((arrivedAt ?? Date.now()) - startedAt) / 60000)),
            distance: distanceText(nav.lengthM, units),
          })}
        </p>
      ) : (
        <dl className="grid grid-cols-3 gap-2">
          <div>
            <dt className="sr-only">{copy.remaining}</dt>
            <dd className="font-display text-4xl font-extrabold leading-none tracking-tight text-foreground">
              {durationText(remainingSec)}
            </dd>
          </div>
          <div className="text-center">
            <dt className="text-xs text-text-secondary">{copy.remaining}</dt>
            <dd className="font-display text-lg font-bold">{distanceText(remainingM, units)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-text-secondary">{copy.arrival}</dt>
            <dd className="font-display text-lg font-bold">{arrivalText(remainingSec, lang)}</dd>
          </div>
        </dl>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">
          {prefLabel}
        </span>
        <span className="text-xs font-semibold text-text-secondary">
          {pct > 0
            ? t("reducedBy", { pct })
            : why.available || ownExposureOnly
              ? t("elevatedKm", { km: fmtLen(scored.hotspotMeters) })
              : t("noExposure")}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-foreground">
        {fill(copy.to, { place: destination })}
      </p>
      <details className="group mt-3 rounded-2xl bg-surface px-3 py-2">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-semibold">
          {copy.why}
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-1 space-y-1 pb-1 text-xs leading-relaxed text-text-secondary">
          {why.lines.map((l) => (
            <li key={l}>• {l}</li>
          ))}
          <li className="pt-1 opacity-80">{t("disclaimer")}</li>
          <li className="opacity-80">{copy.background}</li>
        </ul>
      </details>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEnd}
          className={`h-14 flex-1 rounded-2xl font-display text-base font-bold shadow-soft ${arrived ? "bg-primary text-primary-foreground hover:bg-deep" : "bg-destructive text-destructive-foreground hover:opacity-90"}`}
        >
          {arrived ? copy.done : copy.end}
        </button>
        {!arrived && (
          <button
            type="button"
            onClick={voice.toggle}
            disabled={!voice.supported}
            aria-pressed={!voice.muted && voice.supported}
            aria-label={
              !voice.supported ? copy.voiceUnsupported : voice.muted ? copy.voiceOff : copy.voiceOn
            }
            title={
              !voice.supported ? copy.voiceUnsupported : voice.muted ? copy.voiceOff : copy.voiceOn
            }
            className="grid h-14 w-14 place-items-center rounded-2xl border bg-card text-deep hover:bg-secondary disabled:opacity-40"
          >
            {voice.muted || !voice.supported ? (
              <VolumeX aria-hidden className="h-5 w-5" />
            ) : (
              <Volume2 aria-hidden className="h-5 w-5" />
            )}
          </button>
        )}
        {!arrived && exposureLayer.available && (
          <button
            type="button"
            onClick={exposureLayer.toggle}
            aria-pressed={exposureLayer.on}
            aria-label={copy.exposureLayer}
            title={copy.exposureLayer}
            className={`grid h-14 w-14 place-items-center rounded-2xl border ${exposureLayer.on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-deep hover:bg-secondary"}`}
          >
            <Layers aria-hidden className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  );
}
