/// <reference types="google.maps" />
import { useEffect } from "react";
import type { LatLng } from "@/types/route";

/** Float-pane markers sit above route strokes and the exposure canvas. */
export function RouteEndpoints({
  map,
  start,
  end,
  startLabel,
  endLabel,
  startAddress,
  endAddress,
  showStart = true,
}: {
  map: google.maps.Map;
  start: LatLng | undefined;
  end: LatLng | undefined;
  startLabel: string;
  endLabel: string;
  startAddress: string;
  endAddress: string;
  /** Hidden during navigation, where the live location marker replaces the origin. */
  showStart?: boolean;
}) {
  useEffect(() => {
    const markers = [
      ...(showStart && start
        ? [{ point: start, letter: "A", label: startLabel, type: "start", address: startAddress }]
        : []),
      ...(end
        ? [{ point: end, letter: "B", label: endLabel, type: "end", address: endAddress }]
        : []),
    ].map(({ point, letter, label, type, address }) => {
      class Endpoint extends google.maps.OverlayView {
        element = document.createElement("div");
        override onAdd() {
          this.element.className = `route-endpoint route-endpoint-${type}`;
          this.element.setAttribute("aria-label", label);
          const badge = document.createElement("span");
          badge.className = "route-endpoint-badge";
          badge.textContent = letter;
          const caption = document.createElement("span");
          caption.className = "route-endpoint-caption";
          caption.textContent = label;
          this.element.append(badge, caption);
          this.element.setAttribute("role", "button");
          this.element.tabIndex = 0;
          this.element.title = address;
          const toggle = (e: Event) => {
            e.stopPropagation();
            const open = caption.textContent !== label;
            caption.textContent = open ? label : address || label;
            caption.classList.toggle("route-endpoint-caption-open", !open);
          };
          this.element.addEventListener("click", toggle);
          this.element.addEventListener("keydown", (e) => {
            if (e.key === "Enter") toggle(e);
          });
          google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.element);
          this.getPanes()?.floatPane.appendChild(this.element);
        }
        override draw() {
          const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(point));
          if (p) {
            this.element.style.left = `${p.x}px`;
            this.element.style.top = `${p.y}px`;
          }
        }
        override onRemove() {
          this.element.remove();
        }
      }
      const marker = new Endpoint();
      marker.setMap(map);
      return marker;
    });
    return () => markers.forEach((marker) => marker.setMap(null));
  }, [map, start, end, startLabel, endLabel, startAddress, endAddress, showStart]);
  return null;
}
