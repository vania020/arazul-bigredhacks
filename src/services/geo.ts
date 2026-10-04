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

/**
 * Fast "is this point within tol metres of the path?" check, using a hashed index of points
 * sampled along the path (tol up to ~50 m).
 */
export function pathProximity(path: LatLng[], spacingM = 15) {
  const B = 0.0005; // ≈ 55 m buckets
  const buckets = new Map<string, LatLng[]>();
  const add = (p: LatLng) => {
    const k = `${Math.floor(p.lat / B)}_${Math.floor(p.lng / B)}`;
    const list = buckets.get(k);
    if (list) list.push(p);
    else buckets.set(k, [p]);
  };
  if (path[0]) add(path[0]);
  samplePath(path, spacingM).forEach((s) => add(s.p));
  return (p: LatLng, tolM: number) => {
    const bi = Math.floor(p.lat / B),
      bj = Math.floor(p.lng / B);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const q of buckets.get(`${bi + di}_${bj + dj}`) ?? [])
          if (distanceM(p, q) <= tolM) return true;
    return false;
  };
}

/** Share of a's length that lies within tolM of b (0..1). Not symmetric. */
export function routeOverlap(
  a: LatLng[],
  b: LatLng[] | ((p: LatLng, tolM: number) => boolean),
  tolM = 35,
) {
  const near = typeof b === "function" ? b : pathProximity(b);
  const samples = samplePath(a, 25);
  if (!samples.length) return 0;
  let len = 0,
    close = 0;
  for (const { p, w } of samples) {
    len += w;
    if (near(p, tolM)) close += w;
  }
  return len > 0 ? close / len : 0;
}
