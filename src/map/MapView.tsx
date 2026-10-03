/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import { importLib } from "@/services/googleMaps";
import { useCity } from "@/context/CityContext";

const styles: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  { elementType: "geometry", stylers: [{ saturation: -45 }] },
  { featureType: "water", stylers: [{ lightness: 20 }] },
];

export function MapView({
  onReady,
  onError,
}: {
  onReady: (m: google.maps.Map) => void;
  onError: (e: string) => void;
}) {
  const { city } = useCity();
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    importLib<google.maps.MapsLibrary>("maps")
      .then(({ Map }) => {
        if (cancelled || !el.current) return;
        const map = new Map(el.current, {
          center: city.center,
          zoom: city.zoom,
          styles,
          clickableIcons: false,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
          gestureHandling: "greedy",
        });
        onReady(map);
      })
      .catch((e) => onError(e?.message ?? String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={el} className="absolute inset-0" aria-label="Map" role="region" />;
}
