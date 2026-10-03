import { importLib } from "./googleMaps";
import type { TravelMode } from "@/types/risk";
import type { CandidateRoute, LatLng, LocationValue } from "@/types/route";

let seq = 0;

const toWaypoint = (l: LocationValue) => (l.latLng ? l.latLng : l.label);

const num = (v: any) => (typeof v === "function" ? v() : Number(v));

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
  const { Route } = await importLib<any>("routes");
  const req: any = {
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
  if (q.intermediates?.length) req.intermediates = q.intermediates.map((location) => ({ location, via: true }));
  const { routes } = await Route.computeRoutes(req);
  return (routes ?? [])
    .filter((r: any) => r.path?.length > 1)
    .map((r: any) => ({
      id: `r${++seq}`,
      source: q.intermediates?.length ? "detour" : "google",
      path: r.path.map((p: any) => ({ lat: num(p.lat), lng: num(p.lng) })),
      distanceMeters: r.distanceMeters ?? 0,
      durationSec: Math.round((r.durationMillis ?? 0) / 1000),
      via: q.intermediates,
    }));
}

/** Next future occurrence of an hour in São Paulo (Google needs a future time). */
export function nextOccurrenceOfHour(hour: number, timeZone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  let t = now.getTime() + ((hour - h + 24) % 24) * 3600000 - m * 60000;
  if (t <= now.getTime() + 60000) t += 24 * 3600000;
  return new Date(t);
}

export function currentHourIn(timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date())) % 24;
}

export function describeGoogleError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = msg.match(/[A-Z_]{6,}/)?.[0];
  return code ? `${code} — ${msg}` : msg;
}
