/// <reference types="google.maps" />
import { useEffect } from "react";
import { EXPOSURE_CONFIG as C, EXPOSURE_SCALE } from "@/config/exposureConfig";
import { blendedValue, scaleIndexFor } from "@/services/exposureService";
import { samplePath } from "@/services/geo";
import { cssColor } from "./cssColor";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { LatLng } from "@/types/route";

export type ExposureLayerStatus = "ready" | "zoom-in" | "outside-coverage" | "empty";

/** A viewport-sized canvas; visual intensity never changes route scoring. */
export function ExposureLayer({
  map,
  grid,
  mode,
  hour,
  route,
  scope,
  onStatus,
}: {
  map: google.maps.Map;
  grid: RiskGrid;
  mode: TravelMode;
  hour: number;
  route: LatLng[] | undefined;
  scope: "route" | "city";
  onStatus: (status: ExposureLayerStatus) => void;
}) {
  useEffect(() => {
    const colors = EXPOSURE_SCALE.map((s) => cssColor(s.cssVar));
    const { originLat, originLon, cellSizeM } = grid.meta;
    const mLng = 111320 * Math.cos(((grid.meta.projectionLatitude ?? originLat) * Math.PI) / 180);
    const dLat = cellSizeM / 111320,
      dLng = cellSizeM / mLng;
    const bounds = grid.meta.coverageBounds ?? [
      originLon,
      originLat,
      originLon + grid.meta.cols * dLng,
      originLat + grid.meta.rows * dLat,
    ];
    const corridor = new Set<string>();
    if (route?.length)
      for (const { p } of samplePath(route, cellSizeM * 0.7)) {
        const row = Math.floor((p.lat - originLat) / dLat);
        const col = Math.floor((p.lng - originLon) / dLng);
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++) corridor.add(`${row + dr}_${col + dc}`);
      }

    class Overlay extends google.maps.OverlayView {
      canvas = document.createElement("canvas");
      override onAdd() {
        this.canvas.dataset["testid"] = "exposure-heatmap";
        this.canvas.setAttribute("aria-hidden", "true");
        this.canvas.style.position = "absolute";
        this.canvas.style.pointerEvents = "none";
        this.getPanes()?.overlayLayer.appendChild(this.canvas);
      }
      override onRemove() {
        this.canvas.remove();
      }
      override draw() {
        const proj = this.getProjection();
        const b = map.getBounds();
        const zoom = map.getZoom() ?? 0;
        const ok = zoom >= C.layer.minZoom;
        if (!ok) {
          this.canvas.width = 0;
          onStatus("zoom-in");
          return;
        }
        const ctx = this.canvas.getContext("2d");
        if (!proj || !b || !ctx) {
          this.canvas.width = 0;
          return;
        }
        const ne = b.getNorthEast(),
          sw = b.getSouthWest();
        const tl = proj.fromLatLngToDivPixel(new google.maps.LatLng(ne.lat(), sw.lng()));
        const br = proj.fromLatLngToDivPixel(new google.maps.LatLng(sw.lat(), ne.lng()));
        if (!tl || !br) return;
        const w = Math.max(0, Math.ceil(br.x - tl.x)),
          h = Math.max(0, Math.ceil(br.y - tl.y));
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.ceil(w * dpr);
        this.canvas.height = Math.ceil(h * dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.canvas.style.left = `${tl.x}px`;
        this.canvas.style.top = `${tl.y}px`;
        if (
          ne.lng() <= bounds[0]! ||
          sw.lng() >= bounds[2]! ||
          ne.lat() <= bounds[1]! ||
          sw.lat() >= bounds[3]!
        ) {
          onStatus("outside-coverage");
          return;
        }
        const r0 = Math.max(0, Math.floor((sw.lat() - originLat) / dLat)),
          r1 = Math.min(grid.meta.rows - 1, Math.floor((ne.lat() - originLat) / dLat));
        const c0 = Math.max(0, Math.floor((sw.lng() - originLon) / dLng)),
          c1 = Math.min(grid.meta.cols - 1, Math.floor((ne.lng() - originLon) / dLng));
        let painted = 0;
        // At wide zooms, preserve the strongest activity in each screen pixel.
        // Aggregate before drawing so neighbouring cells do not stack their opacity.
        const pixels = new Map<string, { x: number; y: number; index: number }>();
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const key = `${r}_${c}`;
            const cell = grid.cells[key];
            if (!cell) continue;
            const v = blendedValue(cell, mode, hour) * (grid.meta.displayScale ?? 1);
            if (!Number.isFinite(v) || v < C.layer.minValue || v <= 0) continue;
            const nearRoute = corridor.has(key);
            if (scope === "route" && !nearRoute) continue;
            const south = Math.max(originLat + r * dLat, bounds[1]!),
              west = Math.max(originLon + c * dLng, bounds[0]!),
              north = Math.min(originLat + (r + 1) * dLat, bounds[3]!),
              east = Math.min(originLon + (c + 1) * dLng, bounds[2]!);
            if (south >= north || west >= east) continue;
            const p1 = proj.fromLatLngToDivPixel(new google.maps.LatLng(north, west));
            const p2 = proj.fromLatLngToDivPixel(new google.maps.LatLng(south, east));
            if (!p1 || !p2) continue;
            const index = scaleIndexFor(v);
            const maxOpacity = scope === "route" ? C.layer.routeOpacity : C.layer.opacity;
            ctx.globalAlpha =
              C.layer.minOpacity +
              ((maxOpacity - C.layer.minOpacity) * index) / (EXPOSURE_SCALE.length - 1);
            ctx.fillStyle = colors[index] ?? colors[0]!;
            if ((p2.x - p1.x) * dpr < 1 || (p2.y - p1.y) * dpr < 1) {
              const x = Math.floor(((p1.x + p2.x) / 2 - tl.x) * dpr);
              const y = Math.floor(((p1.y + p2.y) / 2 - tl.y) * dpr);
              const pixelKey = `${x}_${y}`;
              const previous = pixels.get(pixelKey);
              if (!previous || index > previous.index) pixels.set(pixelKey, { x, y, index });
              continue;
            }
            // Round at device resolution, preserving detail on high-density phones.
            const x = Math.round((p1.x - tl.x) * dpr),
              y = Math.round((p1.y - tl.y) * dpr);
            const width = Math.round((p2.x - tl.x) * dpr) - x,
              height = Math.round((p2.y - tl.y) * dpr) - y;
            if (width > 0 && height > 0) {
              ctx.fillRect(x / dpr, y / dpr, width / dpr, height / dpr);
              painted++;
            }
          }
        }
        const maxOpacity = scope === "route" ? C.layer.routeOpacity : C.layer.opacity;
        for (const { x, y, index } of pixels.values()) {
          ctx.globalAlpha =
            C.layer.minOpacity +
            ((maxOpacity - C.layer.minOpacity) * index) / (EXPOSURE_SCALE.length - 1);
          ctx.fillStyle = colors[index] ?? colors[0]!;
          ctx.fillRect(x / dpr, y / dpr, 1 / dpr, 1 / dpr);
          painted++;
        }
        onStatus(painted ? "ready" : "empty");
      }
    }
    const o = new Overlay();
    o.setMap(map);
    const idle = map.addListener("idle", () => o.draw());
    return () => {
      idle.remove();
      o.setMap(null);
    };
  }, [map, grid, mode, hour, route, scope, onStatus]);
  return null;
}
