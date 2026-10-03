import { CITIES } from "@/config/cities";
import type { LocationValue, ScoredRoute } from "@/types/route";
import type { TravelMode, RiskGrid } from "@/types/risk";
import type { Lang } from "@/i18n";
import { tripToolsText } from "@/i18n/trip-tools";
export interface SharedTrip {
  version: 1;
  cityId: string;
  origin: LocationValue;
  destination: LocationValue;
  mode: TravelMode;
  hour: number | null;
  extraMinutes: number;
}
export const MAX_TRIP_URL_LENGTH = 4096;
const fields = [
  "trip",
  "city",
  "origin",
  "originLat",
  "originLng",
  "destination",
  "destinationLat",
  "destinationLng",
  "mode",
  "hour",
  "extra",
];
function locationValid(p: LocationValue) {
  return (
    p &&
    typeof p.label === "string" &&
    p.label.length <= 300 &&
    !Array.from(p.label).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    }) &&
    (p.label.trim().length > 0 || !!p.latLng) &&
    (!p.latLng ||
      (Number.isFinite(p.latLng.lat) &&
        Math.abs(p.latLng.lat) <= 90 &&
        Number.isFinite(p.latLng.lng) &&
        Math.abs(p.latLng.lng) <= 180))
  );
}
function valid(t: SharedTrip) {
  return (
    t.version === 1 &&
    CITIES.some((c) => c.id === t.cityId) &&
    locationValid(t.origin) &&
    locationValid(t.destination) &&
    ["walking", "driving"].includes(t.mode) &&
    (t.hour === null || (Number.isInteger(t.hour) && t.hour >= 0 && t.hour <= 23)) &&
    Number.isInteger(t.extraMinutes) &&
    t.extraMinutes >= 0 &&
    t.extraMinutes <= 15
  );
}
export function createTripUrl(trip: SharedTrip, baseUrl: string): string {
  if (!valid(trip)) throw new Error("Invalid trip");
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL");
  url.search = "";
  url.username = "";
  url.password = "";
  const p = new URLSearchParams({
    trip: "1",
    city: trip.cityId,
    origin: trip.origin.label,
    destination: trip.destination.label,
    mode: trip.mode,
    hour: trip.hour === null ? "now" : String(trip.hour),
    extra: String(trip.extraMinutes),
  });
  for (const key of ["origin", "destination"] as const) {
    const point = trip[key].latLng;
    if (point) {
      p.set(`${key}Lat`, String(point.lat));
      p.set(`${key}Lng`, String(point.lng));
    }
  }
  url.hash = p.toString();
  if (url.href.length > MAX_TRIP_URL_LENGTH) throw new Error("Trip link too long");
  return url.href;
}
export function parseTripUrl(input: string): SharedTrip | null {
  try {
    if (input.length > MAX_TRIP_URL_LENGTH) return null;
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol) || /%(?![0-9a-f]{2})/i.test(url.hash))
      return null;
    decodeURIComponent(url.hash);
    const p = new URLSearchParams(url.hash.slice(1));
    if (
      [...p.keys()].some((k) => !fields.includes(k) || p.getAll(k).length !== 1) ||
      p.get("trip") !== "1"
    )
      return null;
    const point = (key: "origin" | "destination"): LocationValue => {
      const label = p.get(key);
      if (label === null) throw new Error();
      const lat = p.get(`${key}Lat`),
        lng = p.get(`${key}Lng`);
      if ((lat === null) !== (lng === null)) throw new Error();
      if (
        lat !== null &&
        (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(lat) || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(lng!))
      )
        throw new Error();
      return { label, ...(lat !== null ? { latLng: { lat: Number(lat), lng: Number(lng) } } : {}) };
    };
    const hour = p.get("hour"),
      extra = p.get("extra");
    if (
      (hour !== "now" && !/^(?:[0-9]|1[0-9]|2[0-3])$/.test(hour ?? "")) ||
      !/^(?:[0-9]|1[0-5])$/.test(extra ?? "")
    )
      return null;
    const trip: SharedTrip = {
      version: 1,
      cityId: p.get("city") ?? "",
      origin: point("origin"),
      destination: point("destination"),
      mode: p.get("mode") as TravelMode,
      hour: hour === "now" ? null : Number(hour),
      extraMinutes: Number(extra),
    };
    return valid(trip) ? trip : null;
  } catch {
    return null;
  }
}
export interface TripToolsProps {
  trip: SharedTrip;
  route: ScoredRoute;
  grid: RiskGrid | null;
  comparisonAvailable: boolean;
}
export function buildTripSummary(
  { trip, route, grid, comparisonAvailable }: TripToolsProps,
  lang: Lang,
): string {
  const t = tripToolsText[lang],
    city = CITIES.find((c) => c.id === trip.cityId);
  const endpoint = (p: LocationValue) => p.label || `${p.latLng?.lat}, ${p.latLng?.lng}`;
  const lines = [
    t.title,
    `${t.city}: ${city?.name ?? trip.cityId} (${city?.timeZone ?? ""})`,
    `${t.origin}: ${endpoint(trip.origin)}`,
    `${t.destination}: ${endpoint(trip.destination)}`,
    `${t.hour}: ${trip.hour === null ? t.now : `${String(trip.hour).padStart(2, "0")}:00`}`,
    `${t.mode}: ${t[trip.mode]}`,
    `${t.budget}: ${trip.extraMinutes} min`,
    `${t.selected}: ${route.id}`,
    `${t.duration}: ${Math.max(1, Math.round(route.durationSec / 60))} min`,
    `${t.distance}: ${(route.distanceMeters / 1000).toFixed(1)} km`,
    `${t.source}: ${grid ? (grid.isDemo ? t.demo : grid.meta.source) : t.unavailable}`,
    `${t.period}: ${grid?.meta.period ?? t.unavailable}`,
  ];
  if (comparisonAvailable && grid && !grid.isDemo && route.coverage === "covered")
    lines.push(
      `${t.exposure}: ${route.index}`,
      `${t.elevated}: ${(route.hotspotMeters / 1000).toFixed(1)} km`,
    );
  lines.push("", t.notice, t.caveat);
  return lines.join("\n") + "\n";
}
