/// <reference types="google.maps" />
import type { LatLng } from "@/types/route";

export interface LocationMarkerHandle {
  update(p: LatLng, headingDeg: number | null, accuracyM: number, weak: boolean): void;
  remove(): void;
}

const ANIMATION_MS = 900;
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * Float-pane "you are here" overlay (above routes, exposure canvas and endpoints). Positions are
 * interpolated between readings so the marker glides instead of jumping; updates never touch React.
 */
export function createLocationMarker(map: google.maps.Map, label: string): LocationMarkerHandle {
  class Marker extends google.maps.OverlayView {
    el = document.createElement("div");
    accuracyEl = document.createElement("span");
    headingEl = document.createElement("span");
    from: LatLng | null = null;
    to: LatLng | null = null;
    startedAt = 0;
    accuracyM = 0;
    raf = 0;
    override onAdd() {
      this.el.className = "nav-location";
      this.el.setAttribute("role", "img");
      this.el.setAttribute("aria-label", label);
      this.accuracyEl.className = "nav-location-accuracy";
      this.headingEl.className = "nav-location-heading";
      const dot = document.createElement("span");
      dot.className = "nav-location-dot";
      this.el.append(this.accuracyEl, this.headingEl, dot);
      this.getPanes()?.floatPane.appendChild(this.el);
    }
    position(): LatLng | null {
      if (!this.to) return null;
      if (!this.from) return this.to;
      const t = ease(Math.min(1, (performance.now() - this.startedAt) / ANIMATION_MS));
      return {
        lat: this.from.lat + (this.to.lat - this.from.lat) * t,
        lng: this.from.lng + (this.to.lng - this.from.lng) * t,
      };
    }
    override draw() {
      const p = this.position();
      const proj = this.getProjection();
      if (!p || !proj) {
        this.el.style.display = "none";
        return;
      }
      const px = proj.fromLatLngToDivPixel(new google.maps.LatLng(p));
      if (!px) return;
      this.el.style.display = "";
      this.el.style.left = `${px.x}px`;
      this.el.style.top = `${px.y}px`;
      const zoom = map.getZoom() ?? 15;
      const mPerPx = (156543.03392 * Math.cos((p.lat * Math.PI) / 180)) / 2 ** zoom;
      const d = Math.min(400, Math.max(0, (2 * this.accuracyM) / mPerPx));
      this.accuracyEl.style.width = this.accuracyEl.style.height = `${d}px`;
    }
    animate = () => {
      this.draw();
      if (performance.now() - this.startedAt < ANIMATION_MS)
        this.raf = requestAnimationFrame(this.animate);
    };
    place(p: LatLng, headingDeg: number | null, accuracyM: number, weak: boolean) {
      this.from = this.position();
      this.to = p;
      this.startedAt = performance.now();
      this.accuracyM = accuracyM;
      this.el.classList.toggle("nav-location-weak", weak);
      this.headingEl.style.display = headingDeg === null ? "none" : "";
      if (headingDeg !== null) this.headingEl.style.transform = `rotate(${headingDeg}deg)`;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.animate);
    }
    override onRemove() {
      cancelAnimationFrame(this.raf);
      this.el.remove();
    }
  }
  const marker = new Marker();
  marker.setMap(map);
  return {
    update: (p, heading, accuracy, weak) => marker.place(p, heading, accuracy, weak),
    remove: () => marker.setMap(null),
  };
}
