/** NYC polygon coverage guard. Uses geographic coordinates only for inclusion,
 * never to measure distance or to change route exposure mathematics.
 * Checks whole polyline segments, including paths whose endpoints are covered
 * but whose middle leaves NYC. Borough polygons include NYC water jurisdiction.
 */
export type CoveragePoint = { lat: number; lng: number };
type XY = [number, number];
type Polygon = XY[][];
export type CoverageGeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry:
      { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] };
    properties?: Record<string, unknown>;
  }>;
};
const EPS = 1e-10;
function cross(a: XY, b: XY) {
  return a[0] * b[1] - a[1] * b[0];
}
function sub(a: XY, b: XY): XY {
  return [a[0] - b[0], a[1] - b[1]];
}
function onSegment(p: XY, a: XY, b: XY) {
  const d = sub(b, a),
    v = sub(p, a);
  const length = Math.hypot(d[0], d[1]);
  return (
    Math.abs(cross(d, v)) <= EPS * Math.max(length, EPS) &&
    p[0] >= Math.min(a[0], b[0]) - EPS &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}
function ringState(p: XY, ring: XY[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!,
      b = ring[i]!;
    if (onSegment(p, a, b)) return 2;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 1 : 0;
}
function polygons(geo: CoverageGeoJSON): Polygon[] {
  return geo.features.flatMap((f) =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
  );
}
function inside(p: XY, shapes: Polygon[]) {
  return shapes.some((polygon) => {
    const outer = ringState(p, polygon[0]!);
    if (outer === 0) return false;
    if (outer === 2) return true;
    return polygon.slice(1).every((hole) => ringState(p, hole) !== 1);
  });
}
export function validateCoverageGeoJSON(input: unknown): CoverageGeoJSON {
  const g = input as CoverageGeoJSON;
  if (g?.type !== "FeatureCollection" || !Array.isArray(g.features) || !g.features.length)
    throw new Error("Invalid polygon coverage");
  for (const f of g.features) {
    if (!f?.geometry || !["Polygon", "MultiPolygon"].includes(f.geometry.type))
      throw new Error("Invalid coverage geometry");
    const shapes =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (!Array.isArray(shapes) || !shapes.length) throw new Error("Empty polygon coverage");
    for (const shape of shapes) {
      if (!Array.isArray(shape) || !shape.length) throw new Error("Empty polygon");
      for (const ring of shape) {
        if (
          !Array.isArray(ring) ||
          ring.length < 4 ||
          ring.some(
            (p) =>
              !Array.isArray(p) ||
              p.length < 2 ||
              !Number.isFinite(p[0]) ||
              !Number.isFinite(p[1]) ||
              Math.abs(p[0]) > 180 ||
              Math.abs(p[1]) > 90,
          )
        )
          throw new Error("Invalid polygon ring");
        const a = ring[0]!,
          b = ring[ring.length - 1]!;
        if (a[0] !== b[0] || a[1] !== b[1]) throw new Error("Unclosed polygon ring");
      }
    }
  }
  return g;
}
export function isPointInsideCoverage(point: CoveragePoint, geo: CoverageGeoJSON) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    inside([point.lng, point.lat], polygons(geo))
  );
}
export function isPathInsideCoverage(path: CoveragePoint[], geo: CoverageGeoJSON) {
  if (path.length < 2) return false;
  const shapes = polygons(geo);
  if (
    !path.every(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && inside([p.lng, p.lat], shapes),
    )
  )
    return false;
  for (let i = 1; i < path.length; i++) {
    const a: XY = [path[i - 1]!.lng, path[i - 1]!.lat],
      b: XY = [path[i]!.lng, path[i]!.lat],
      d = sub(b, a);
    if (Math.hypot(d[0], d[1]) < EPS) continue;
    const cuts = [0, 1];
    for (const shape of shapes)
      for (const ring of shape)
        for (let j = 1; j < ring.length; j++) {
          const c = ring[j - 1]!,
            e = ring[j]!,
            edge = sub(e, c),
            offset = sub(c, a),
            den = cross(d, edge);
          if (Math.abs(den) < 1e-20) {
            if (Math.abs(cross(offset, d)) < 1e-20) {
              const axis = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1;
              for (const p of [c, e]) {
                const t = (p[axis] - a[axis]) / d[axis];
                if (t > 0 && t < 1) cuts.push(t);
              }
            }
            continue;
          }
          const t = cross(offset, edge) / den,
            u = cross(offset, d) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
        }
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++) {
      if (cuts[j]! - cuts[j - 1]! < 1e-12) continue;
      const t = (cuts[j]! + cuts[j - 1]!) / 2;
      if (!inside([a[0] + t * d[0], a[1] + t * d[1]], shapes)) return false;
    }
  }
  return true;
}
