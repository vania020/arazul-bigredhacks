/// <reference types="google.maps" />
import { useEffect } from "react";
import { EXPOSURE_CONFIG as C, EXPOSURE_SCALE } from "@/config/exposureConfig";
import { blendedValue, scaleIndexFor } from "@/services/exposureService";
import { samplePath } from "@/services/geo";
import { cssColor } from "./cssColor";
import type { RiskGrid, TravelMode } from "@/types/risk";
import type { LatLng } from "@/types/route";

/** Single canvas OverlayView drawing only in-viewport 100 m cells above a minimum value. */
export function ExposureLayer({ map, grid, mode, hour, route, scope, onZoomOk }: { map: google.maps.Map; grid: RiskGrid; mode: TravelMode; hour: number; route: LatLng[] | undefined; scope: "route" | "city"; onZoomOk: (ok: boolean) => void }) {
  useEffect(() => {
    const colors = EXPOSURE_SCALE.map((s) => cssColor(s.cssVar));
    const { originLat, originLon, cellSizeM } = grid.meta;
    const mLng = 111320 * Math.cos((originLat * Math.PI) / 180);
    const dLat = cellSizeM / 111320, dLng = cellSizeM / mLng;
    const corridor = new Set<string>();
    if (route?.length) for (const { p } of samplePath(route, cellSizeM * 0.7)) {
      const row = Math.floor((p.lat - originLat) / dLat);
      const col = Math.floor((p.lng - originLon) / dLng);
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) corridor.add(`${row + dr}_${col + dc}`);
    }

    class Overlay extends google.maps.OverlayView {
      canvas = document.createElement("canvas");
      override onAdd() {
        this.canvas.style.position = "absolute";
        this.canvas.style.pointerEvents = "none";
        this.getPanes()?.overlayLayer.appendChild(this.canvas);
      }
      override onRemove() { this.canvas.remove(); }
      override draw() {
        const proj = this.getProjection();
        const b = map.getBounds();
        const zoom = map.getZoom() ?? 0;
        const ok = zoom >= C.layer.minZoom;
        onZoomOk(ok);
        const ctx = this.canvas.getContext("2d");
        if (!proj || !b || !ok || !ctx) { this.canvas.width = 0; return; }
        const ne = b.getNorthEast(), sw = b.getSouthWest();
        const tl = proj.fromLatLngToDivPixel(new google.maps.LatLng(ne.lat(), sw.lng()));
        const br = proj.fromLatLngToDivPixel(new google.maps.LatLng(sw.lat(), ne.lng()));
        if (!tl || !br) return;
        const w = Math.ceil(br.x - tl.x), h = Math.ceil(br.y - tl.y);
        this.canvas.width = w; this.canvas.height = h;
        this.canvas.style.left = `${tl.x}px`; this.canvas.style.top = `${tl.y}px`;
        const r0 = Math.floor((sw.lat() - originLat) / dLat), r1 = Math.floor((ne.lat() - originLat) / dLat);
        const c0 = Math.floor((sw.lng() - originLon) / dLng), c1 = Math.floor((ne.lng() - originLon) / dLng);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const key = `${r}_${c}`;
            const cell = grid.cells[key];
            if (!cell) continue;
            const v = blendedValue(cell, mode, hour);
            if (v < C.layer.minValue) continue;
            const nearRoute = corridor.has(key);
            const lowDetail = zoom < 14;
            if (scope === "route" && !nearRoute) continue;
            if (scope === "city" && lowDetail && v < 10) continue;
            const lat = originLat + r * dLat, lng = originLon + c * dLng;
            const p1 = proj.fromLatLngToDivPixel(new google.maps.LatLng(lat + dLat, lng));
            const p2 = proj.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng + dLng));
            if (!p1 || !p2) continue;
            // Low/moderate cells stay faint; only genuinely high values reach ~25-35%.
            const tier = v < 5 ? 0.25 : v < 10 ? 0.5 : v < 25 ? 0.8 : 1.2;
            ctx.globalAlpha = (scope === "route" ? 0.24 : lowDetail ? 0.08 : 0.13) * tier;
            ctx.fillStyle = colors[scaleIndexFor(v)] ?? "";
            ctx.fillRect(p1.x - tl.x, p1.y - tl.y, Math.ceil(p2.x - p1.x), Math.ceil(p2.y - p1.y));
          }
        }
      }
    }
    const o = new Overlay();
    o.setMap(map);
    const idle = map.addListener("idle", () => o.draw());
    return () => { idle.remove(); o.setMap(null); };
  }, [map, grid, mode, hour, route, scope, onZoomOk]);
  return null;
}
