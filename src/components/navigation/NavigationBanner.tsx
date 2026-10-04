import { Loader2 } from "lucide-react";
import { Macaw } from "@/components/brand/Macaw";
import type { NavCopy } from "@/i18n/navigation";
import { formatDistance, type Units } from "@/navigation/format";
import type { NavRoute } from "@/navigation/navRoute";
import type { Maneuver, Progress } from "@/navigation/tracker";
import type { GpsStatus, NavStatus } from "@/navigation/useNavigation";
import { ManeuverIcon } from "./ManeuverIcon";

interface Props {
  copy: NavCopy;
  status: NavStatus;
  gps: GpsStatus;
  progress: Progress | null;
  nav: NavRoute;
  units: Units;
  destination: string;
  notice: string | null;
  rerouteBlocked: boolean;
  /** The route preference could not be kept from here; nothing was substituted. */
  routeIssue: string | null;
  recalcReady: boolean;
  onRecalculate: () => void;
  onRetry: () => void;
  /** Desktop: rendered inside the side panel instead of floating over the map. */
  docked?: boolean;
}

const text = (m: Maneuver, copy: NavCopy) => (m === "arrive" ? copy.arrive : m.instruction);
const icon = (m: Maneuver) => (m === "arrive" ? "ARRIVE" : m.maneuver);

/** Top-of-map instruction card: the current maneuver is the largest thing on screen. */
export function NavigationBanner({
  copy,
  status,
  gps,
  progress,
  nav,
  units,
  destination,
  notice,
  rerouteBlocked,
  routeIssue,
  recalcReady,
  onRecalculate,
  onRetry,
  docked = false,
}: Props) {
  // Before the first fix, preview the route's departure instruction.
  const first = nav.steps[0]!;
  const primary: Maneuver = progress?.primary ?? first;
  const then: Maneuver | null = progress ? progress.then : (nav.steps[1] ?? "arrive");
  const distance = formatDistance(
    progress?.distanceToManeuverM ?? nav.steps[1]?.startM ?? nav.lengthM,
    units,
  );
  const fatal = status === "error";
  const gpsMessage =
    gps === "waiting"
      ? copy.waitingGps
      : gps === "weak"
        ? copy.weakGps
        : gps === "lost"
          ? copy.lostGps
          : gps === "unavailable"
            ? copy.unavailable
            : null;

  return (
    <div
      className={
        docked
          ? "flex flex-col gap-2"
          : "pointer-events-none absolute inset-x-3 top-3 z-20 mx-auto flex max-w-lg flex-col gap-2"
      }
    >
      {fatal ? (
        <div
          role="alert"
          className="pointer-events-auto rounded-3xl border bg-card p-4 shadow-float"
        >
          <p className="font-display text-lg font-extrabold text-deep">
            {gps === "denied" ? copy.denied : gps === "insecure" ? copy.insecure : copy.unsupported}
          </p>
          {gps === "denied" && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 h-12 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              {copy.retry}
            </button>
          )}
        </div>
      ) : status === "arrived" ? (
        <div
          role="status"
          className="bubble-in pointer-events-auto flex items-center gap-3 rounded-3xl border bg-card p-3 pr-4 text-foreground shadow-float"
        >
          <Macaw className="h-16 w-16 shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-2xl font-extrabold leading-tight text-deep">
              {copy.arrived}
            </p>
            <p className="truncate text-sm text-text-secondary">{destination}</p>
          </div>
        </div>
      ) : (
        <section
          aria-live="polite"
          aria-label={text(primary, copy)}
          className="pointer-events-auto overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-deep text-primary-foreground shadow-float"
        >
          {status === "rerouting" && (
            <p className="flex items-center gap-2 bg-sky-soft px-4 py-2 text-sm font-bold text-deep">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {copy.recalculating}
            </p>
          )}
          <div
            className={`flex items-center gap-4 p-4 ${status === "rerouting" ? "opacity-50" : ""}`}
          >
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
              <ManeuverIcon maneuver={icon(primary)} className="h-10 w-10" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-3xl font-extrabold leading-none">
                {distance.value}
                <span className="ml-1 text-lg font-bold opacity-85">{distance.unit}</span>
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug">{text(primary, copy)}</p>
              {primary !== "arrive" && primary.detail && (
                <p className="mt-0.5 text-xs opacity-80">{primary.detail}</p>
              )}
            </div>
          </div>
          {then && (
            <p className="flex items-center gap-2 border-t border-primary-foreground/15 bg-navy/35 px-4 py-2.5 text-sm">
              <span className="font-semibold opacity-80">{copy.then}</span>
              <ManeuverIcon maneuver={icon(then)} className="h-4 w-4 shrink-0" />
              <span className="truncate">{text(then, copy)}</span>
            </p>
          )}
        </section>
      )}
      {!fatal && status !== "arrived" && gpsMessage && (
        <p
          role="status"
          className="glass self-start rounded-full border px-3.5 py-2 text-xs font-semibold text-deep shadow-soft"
        >
          {gpsMessage}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="glass self-start rounded-full border px-3.5 py-2 text-xs font-semibold text-deep shadow-soft"
        >
          {notice}
        </p>
      )}
      {(routeIssue || rerouteBlocked) && status === "navigating" && (
        <div
          role="alert"
          className="pointer-events-auto flex items-center gap-2 self-stretch rounded-2xl border bg-card px-3 py-2 text-xs text-deep shadow-soft"
        >
          <span className="flex-1">{routeIssue ?? copy.rerouteLimit}</span>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={!recalcReady}
            className="min-h-9 shrink-0 font-bold text-primary underline disabled:opacity-40"
          >
            {copy.recalculate}
          </button>
        </div>
      )}
    </div>
  );
}
