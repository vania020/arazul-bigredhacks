import type { CoverageArea, IncidentCell } from "./types";
import type { RecentFeed } from "./recent-types";
import { aggregateRecentBubbles } from "./recent-bubbles";
const areas: Record<string, CoverageArea> = {
  nyc: { id: "nyc", cityId: "nyc", bounds: [-74.26, 40.49, -73.7, 40.93] },
  chicago: { id: "chicago", cityId: "chicago", bounds: [-87.95, 41.64, -87.52, 42.03] },
  "san-francisco": { id: "san-francisco", cityId: "sf", bounds: [-122.52, 37.7, -122.35, 37.84] },
};
export const activityArea = (cityId: string) => areas[cityId];
/** Independent coarse grid: never reads or writes historical exposure cells. */
export function activityBubbles(feed: RecentFeed, cityId: string) {
  const area = activityArea(cityId);
  if (!area || feed.areaId !== area.id) return [];
  const dy = 250 / 111320;
  const dx = dy / Math.cos((((area.bounds[1] + area.bounds[3]) / 2) * Math.PI) / 180);
  const cells = new Map<string, IncidentCell>();
  for (const r of feed.records) {
    const x = Math.floor(r.point[0] / dx),
      y = Math.floor(r.point[1] / dy);
    const id = `${x}:${y}`;
    cells.set(id, {
      id,
      center: [(x + 0.5) * dx, (y + 0.5) * dy],
      bounds: [x * dx, y * dy, (x + 1) * dx, (y + 1) * dy],
    });
  }
  return aggregateRecentBubbles(feed.records, [...cells.values()], area.bounds).filter(
    (b) => b.count >= 2,
  );
}
