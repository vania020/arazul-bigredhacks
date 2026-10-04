/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import { cssColor } from "./cssColor";
import type { LatLng } from "@/types/route";

interface Props {
  map: google.maps.Map;
  path: LatLng[];
  selected: boolean;
  kind?: "recommended" | "fastest" | "alternative";
  label?: string | undefined;
  onClick: () => void;
}

/** Selected route is always blue, thick and on top with a halo; every other route is thin muted gray-blue beneath. */
export function RoutePolyline({ map, path, selected, kind = "fastest", label, onClick }: Props) {
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  useEffect(() => {
    const glow =
      selected && kind === "recommended"
        ? new google.maps.Polyline({
            map,
            path,
            strokeColor: cssColor("--route-selected-glow"),
            strokeWeight: 21,
            strokeOpacity: 0.75,
            zIndex: 98,
            clickable: false,
          })
        : null;
    // White casing separates routes from gray map roads; the selected one gets a full halo.
    const halo = new google.maps.Polyline({
      map,
      path,
      strokeColor: cssColor("--route-halo"),
      strokeWeight: selected ? 11 : 7,
      strokeOpacity: selected ? 0.95 : 0.5,
      zIndex: selected ? 99 : 9,
      clickable: false,
    });
    const line = new google.maps.Polyline({
      map,
      path,
      strokeColor: cssColor(
        selected
          ? "--route-recommended"
          : kind === "alternative"
            ? "--route-alternative"
            : "--route-fastest",
      ),
      strokeWeight: selected ? 6 : 4,
      strokeOpacity: selected ? 1 : 0.9,
      zIndex: selected ? 100 : 10,
    });
    const l = line.addListener("click", () => clickRef.current());
    return () => {
      l.remove();
      line.setMap(null);
      halo.setMap(null);
      glow?.setMap(null);
    };
  }, [map, path, selected, kind]);
  useEffect(() => {
    if (!label || !path.length) return;
    const point =
      path[Math.floor((path.length - 1) * (selected ? 0.55 : kind === "fastest" ? 0.4 : 0.7))]!;
    class Label extends google.maps.OverlayView {
      element = document.createElement("button");
      override onAdd() {
        this.element.type = "button";
        this.element.textContent = label!;
        Object.assign(this.element.style, {
          position: "absolute",
          transform: "translate(-50%, -100%)",
          padding: "6px 10px",
          borderRadius: "999px",
          border: `2px solid ${cssColor("--route-halo")}`,
          background: cssColor(selected ? "--route-recommended" : "--card"),
          color: cssColor(selected ? "--route-halo" : "--deep"),
          fontSize: "12px",
          fontWeight: "700",
          whiteSpace: "nowrap",
          cursor: "pointer",
          zIndex: selected ? "101" : "10",
        });
        this.element.onclick = () => clickRef.current();
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.element);
        this.getPanes()?.floatPane.appendChild(this.element);
      }
      override draw() {
        const pixel = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(point));
        if (pixel) {
          this.element.style.left = `${pixel.x}px`;
          this.element.style.top = `${pixel.y}px`;
        }
      }
      override onRemove() {
        this.element.remove();
      }
    }
    const overlay = new Label();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, path, label, selected, kind]);
  return null;
}
