import { distanceM } from "@/services/geo";
import type { LatLng } from "@/types/route";

/** A path with cumulative along-route distances (meters) at each vertex. */
export interface MeasuredPath {
  path: LatLng[];
  cum: number[];
  lengthM: number;
}

export interface Projection {
  alongM: number;
  distanceM: number; // lateral distance from the path
  segIndex: number;
  point: LatLng;
}

const rad = (d: number) => (d * Math.PI) / 180;
const M_PER_LAT = 111320;

export function measurePath(path: LatLng[]): MeasuredPath {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + distanceM(path[i - 1]!, path[i]!));
  return { path, cum, lengthM: cum[cum.length - 1] ?? 0 };
}

/** Closest point on segments overlapping [fromM, toM]; local planar math is accurate at street scale. */
export function projectOnPath(
  mp: MeasuredPath,
  p: LatLng,
  fromM = 0,
  toM = Number.POSITIVE_INFINITY,
): Projection | null {
  let best: Projection | null = null;
  for (let i = 0; i < mp.path.length - 1; i++) {
    const c0 = mp.cum[i]!,
      c1 = mp.cum[i + 1]!;
    if (c1 < fromM || c0 > toM) continue;
    const a = mp.path[i]!,
      b = mp.path[i + 1]!;
    const mPerLng = M_PER_LAT * Math.cos(rad(a.lat));
    const bx = (b.lng - a.lng) * mPerLng,
      by = (b.lat - a.lat) * M_PER_LAT;
    const px = (p.lng - a.lng) * mPerLng,
      py = (p.lat - a.lat) * M_PER_LAT;
    const len2 = bx * bx + by * by;
    let t = len2 > 0 ? (px * bx + py * by) / len2 : 0;
    // Clamp to the requested window inside this segment as well.
    const segLen = c1 - c0;
    if (segLen > 0) {
      t = Math.max(t, (fromM - c0) / segLen);
      t = Math.min(t, (toM - c0) / segLen);
    }
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - bx * t, py - by * t);
    if (!best || d < best.distanceM)
      best = {
        alongM: c0 + segLen * t,
        distanceM: d,
        segIndex: i,
        point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      };
  }
  return best;
}

function segmentAt(mp: MeasuredPath, alongM: number) {
  const { cum } = mp;
  let lo = 0,
    hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= alongM) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pointAlong(mp: MeasuredPath, alongM: number): LatLng {
  if (mp.path.length < 2) return mp.path[0]!;
  const d = Math.max(0, Math.min(mp.lengthM, alongM));
  const i = Math.min(segmentAt(mp, d), mp.path.length - 2);
  const a = mp.path[i]!,
    b = mp.path[i + 1]!;
  const seg = mp.cum[i + 1]! - mp.cum[i]!;
  const t = seg > 0 ? (d - mp.cum[i]!) / seg : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Compass bearing in degrees (0 = north, clockwise). */
export function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function bearingAlong(mp: MeasuredPath, alongM: number) {
  if (mp.path.length < 2) return null;
  const i = Math.min(segmentAt(mp, Math.max(0, Math.min(mp.lengthM, alongM))), mp.path.length - 2);
  return bearing(mp.path[i]!, mp.path[i + 1]!);
}
