import type { LatLng } from "@/types/route";

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Point offset perpendicular to direction a->b, by meters (positive = left). */
export function perpendicularOffset(p: LatLng, a: LatLng, b: LatLng, meters: number): LatLng {
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(rad(p.lat));
  const dx = (b.lng - a.lng) * mPerLng;
  const dy = (b.lat - a.lat) * mPerLat;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len,
    ny = dx / len;
  return { lat: p.lat + (ny * meters) / mPerLat, lng: p.lng + (nx * meters) / mPerLng };
}

/** Resample path at roughly fixed spacing; returns points with the spacing each represents. */
export function samplePath(path: LatLng[], spacing: number): { p: LatLng; w: number }[] {
  const out: { p: LatLng; w: number }[] = [];
  if (path.length < 2) return out;
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!,
      b = path[i + 1]!;
    const seg = distanceM(a, b);
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({
        p: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        w: spacing,
      });
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  if (carry > 1) out.push({ p: path[path.length - 1]!, w: carry });
  return out;
}

export function pathSimilar(a: LatLng[], b: LatLng[], thresholdM: number) {
  const n = 24;
  const pick = (p: LatLng[], i: number): LatLng =>
    p[Math.min(p.length - 1, Math.round((i / (n - 1)) * (p.length - 1)))]!;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += distanceM(pick(a, i), pick(b, i));
  return sum / n < thresholdM;
}
