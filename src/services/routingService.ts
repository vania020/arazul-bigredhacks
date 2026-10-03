import { importLib } from "./googleMaps";
import type { TravelMode } from "@/types/risk";
import type { CandidateRoute, LatLng, LocationValue } from "@/types/route";

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
}

/** Routes library computeRoutes (no legacy DirectionsService). */
export async function computeRoutes(q: RouteQuery): Promise<CandidateRoute[]> {
  const { Route } = await importLib<google.maps.RoutesLibrary>("routes");
  const req: google.maps.routes.ComputeRoutesRequest = {
    origin: toWaypoint(q.origin),
    destination: toWaypoint(q.destination),
    travelMode: q.mode === "walking" ? "WALKING" : "DRIVING",
    computeAlternativeRoutes: q.alternatives,
    fields: ["path", "distanceMeters", "durationMillis"],
  };
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
    .map((r) => ({
      id: `r${++seq}`,
      source: q.intermediates?.length ? "detour" : "google",
      path: r.path.map((p) => ({ lat: num(p.lat), lng: num(p.lng) })),
      distanceMeters: r.distanceMeters ?? 0,
      durationSec: Math.round((r.durationMillis ?? 0) / 1000),
      ...(q.intermediates ? { via: q.intermediates } : {}),
    }));
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
