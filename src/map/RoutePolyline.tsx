/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import { cssColor } from "./cssColor";
import type { LatLng } from "@/types/route";

interface Props { map: google.maps.Map; path: LatLng[]; selected: boolean; onClick: () => void }

/** Selected route is always blue, thick and on top with a halo; every other route is thin muted gray-blue beneath. */
export function RoutePolyline({ map, path, selected, onClick }: Props) {
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  useEffect(() => {
    // White casing separates routes from gray map roads; the selected one gets a full halo.
    const halo = new google.maps.Polyline({ map, path, strokeColor: cssColor("--route-halo"), strokeWeight: selected ? 10 : 6, strokeOpacity: selected ? 0.95 : 0.5, zIndex: selected ? 99 : 9, clickable: false });
    const line = new google.maps.Polyline({
      map, path,
      strokeColor: cssColor(selected ? "--route-recommended" : "--route-fastest"),
      strokeWeight: selected ? 6 : 4,
      strokeOpacity: selected ? 1 : 0.9,
      zIndex: selected ? 100 : 10,
    });
    const l = line.addListener("click", () => clickRef.current());
    return () => { l.remove(); line.setMap(null); halo.setMap(null); };
  }, [map, path, selected]);
  return null;
}
