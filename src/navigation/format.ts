import type { Lang } from "@/i18n";
import type { NavCopy } from "@/i18n/navigation";

export type Units = "metric" | "imperial";

/** US and UK road signage use miles/feet; every other supported city is metric. */
export const unitsForCountry = (countryCode: string): Units =>
  countryCode === "us" || countryCode === "gb" ? "imperial" : "metric";

/** Google instruction / speech language for the app's UI language. */
export const routeLanguage = (lang: Lang) =>
  lang === "pt" ? "pt-BR" : lang === "es" ? "es" : "en";
export const speechLanguage = (lang: Lang) =>
  lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US";

export interface FormattedDistance {
  value: string;
  unit: "m" | "km" | "ft" | "mi";
}

/** Navigation-style rounding: coarser as the maneuver gets farther away. */
export function formatDistance(meters: number, units: Units): FormattedDistance {
  const m = Math.max(0, meters);
  if (units === "imperial") {
    const ft = m * 3.28084;
    if (ft < 1000)
      return {
        value: String(ft < 100 ? Math.round(ft / 10) * 10 : Math.round(ft / 50) * 50),
        unit: "ft",
      };
    const mi = m / 1609.344;
    return { value: mi < 10 ? mi.toFixed(1) : String(Math.round(mi)), unit: "mi" };
  }
  if (m < 1000)
    return { value: String(m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10), unit: "m" };
  const km = m / 1000;
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: "km" };
}

export const distanceText = (meters: number, units: Units) => {
  const d = formatDistance(meters, units);
  return `${d.value} ${d.unit}`;
};

export function spokenDistance(meters: number, units: Units, copy: NavCopy) {
  const d = formatDistance(meters, units);
  const word = { m: copy.meters, km: copy.kilometers, ft: copy.feet, mi: copy.miles }[d.unit];
  return `${d.value} ${word}`;
}

export function durationText(sec: number) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Arrival clock time in the device's own timezone (the traveller is physically there). */
export const arrivalText = (sec: number, lang: Lang, now = Date.now()) =>
  new Date(now + sec * 1000).toLocaleTimeString(routeLanguage(lang), {
    hour: "numeric",
    minute: "2-digit",
  });
