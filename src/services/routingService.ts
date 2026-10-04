import { importLib } from "./googleMaps";
import type { TravelMode } from "@/types/risk";
import type { CandidateRoute, LatLng, LocationValue, RouteStep } from "@/types/route";

let seq = 0;

const toWaypoint = (l: LocationValue) => (l.latLng ? l.latLng : l.label);

const num = (v: number | (() => number)) => (typeof v === "function" ? v() : Number(v));

export interface RouteQuery {
  origin: LocationValue;
  destination: LocationValue;
  mode: TravelMode;
  departure: Date | null;
  intermediates?: LatLng[];
  alternatives: boolean;
  /** BCP-47 language for Google's step instructions (e.g. "pt-BR"). */
  language?: string;
}

const toLatLng = (p: google.maps.LatLngAltitude | google.maps.LatLngLiteral): LatLng => ({
  lat: num(p.lat),
  lng: num(p.lng),
});

/** Flattens every leg's steps; navigation follows these on exactly the scored geometry. */
function toSteps(legs: google.maps.routes.RouteLeg[] | undefined): RouteStep[] | undefined {
  const steps = (legs ?? []).flatMap((leg) =>
    (leg.steps ?? []).map((s) => {
      const path = (s.path ?? []).map(toLatLng);
      if (path.length < 2 && s.startLocation && s.endLocation)
        path.splice(0, path.length, toLatLng(s.startLocation), toLatLng(s.endLocation));
      return {
        instruction: s.instructions ?? "",
        maneuver: s.maneuver ?? null,
        distanceMeters: s.distanceMeters ?? 0,
        durationSec: Math.round((s.staticDurationMillis ?? 0) / 1000),
        path,
      };
    }),
  );
  return steps.length ? steps : undefined;
}

let warnedMissingSteps = false;
/** One console hint if Google omits step data, instead of silently degrading navigation. */
function checkSteps(steps: RouteStep[] | undefined) {
  if (warnedMissingSteps) return;
  const usable = steps?.some((s) => s.instruction && s.path.length >= 2);
  if (usable) return;
  warnedMissingSteps = true;
  console.warn(
    "[ARAZUL routing] Google returned no usable route steps (instructions + step path); in-app navigation will only show 'Follow the route'. Check ComputeRoutesRequest.fields includes 'legs' and 'path'.",
  );
}

/** Routes library computeRoutes (no legacy DirectionsService). */
export async function computeRoutes(q: RouteQuery): Promise<CandidateRoute[]> {
  const { Route } = await importLib<google.maps.RoutesLibrary>("routes");
  const req: google.maps.routes.ComputeRoutesRequest = {
    origin: toWaypoint(q.origin),
    destination: toWaypoint(q.destination),
    travelMode: q.mode === "walking" ? "WALKING" : "DRIVING",
    computeAlternativeRoutes: q.alternatives,
    // "legs" carries RouteLeg.steps (instructions, maneuver, start/end locations, static
    // duration); RouteLegStep.path is only populated when "path" is also requested.
    fields: ["path", "distanceMeters", "durationMillis", "legs"],
  };
  if (q.language) req.language = q.language;
  if (q.mode === "driving") {
    req.routingPreference = "TRAFFIC_AWARE";
    if (q.departure) req.departureTime = q.departure;
  }
  if (q.intermediates?.length)
    req.intermediates = q.intermediates.map((location) => ({ location, via: true }));
  const { routes } = await Route.computeRoutes(req);
  return (routes ?? [])
    .filter(
      (r): r is google.maps.routes.Route & { path: google.maps.LatLng[] } =>
        !!r.path && r.path.length > 1,
    )
    .map((r) => {
      const steps = toSteps(r.legs);
      checkSteps(steps);
      return {
        id: `r${++seq}`,
        source: q.intermediates?.length ? "detour" : "google",
        path: r.path.map(toLatLng),
        distanceMeters: r.distanceMeters ?? 0,
        durationSec: Math.round((r.durationMillis ?? 0) / 1000),
        ...(q.intermediates ? { via: q.intermediates } : {}),
        ...(steps ? { steps } : {}),
      };
    });
}

/** Earliest local hour boundary more than one minute ahead, including DST repeats/skips. */
export function nextOccurrenceOfHour(hour: number, timeZone: string, now = new Date()): Date {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    throw new RangeError("Departure hour must be an integer from 0 to 23");
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new RangeError("Invalid current date");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  // Search UTC minute boundaries: this also supports half/quarter-hour UTC offsets.
  // Formatting each candidate lets Intl handle gaps and repeated local hours.
  const first = (Math.floor((nowMs + 60000) / 60000) + 1) * 60000;
  const limit = nowMs + 48 * 3600000;
  for (let t = first; t <= limit; t += 60000) {
    const parts = formatter.formatToParts(t);
    const localHour = Number(parts.find((p) => p.type === "hour")?.value);
    const localMinute = Number(parts.find((p) => p.type === "minute")?.value);
    if (localHour === hour && localMinute === 0) return new Date(t);
  }
  throw new RangeError("No matching departure hour within 48 hours");
}

export function currentHourIn(timeZone: string) {
  return (
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(
        new Date(),
      ),
    ) % 24
  );
}

export function describeGoogleError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = msg.match(/[A-Z_]{6,}/)?.[0];
  return code ? `${code} — ${msg}` : msg;
}
