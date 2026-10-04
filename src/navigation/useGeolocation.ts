import { useEffect, useRef } from "react";
import { NAVIGATION_CONFIG as N } from "@/config/navigationConfig";
import type { Fix } from "./tracker";

export type GeoErrorKind = "unsupported" | "insecure" | "denied" | "unavailable" | "timeout";

/**
 * Watches the device position only while `active`. The watch id lives in the effect closure and
 * is always cleared on deactivate/unmount. Readings go straight to the callback (not React state).
 */
export function useGeolocationWatch(
  active: boolean,
  attempt: number,
  onFix: (fix: Fix) => void,
  onError: (kind: GeoErrorKind) => void,
) {
  const fixRef = useRef(onFix);
  const errorRef = useRef(onError);
  fixRef.current = onFix;
  errorRef.current = onError;
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      errorRef.current("unsupported");
      return;
    }
    if (window.isSecureContext === false) {
      errorRef.current("insecure");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        fixRef.current({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          headingDeg: pos.coords.heading,
          speedMps: pos.coords.speed,
          timestamp: pos.timestamp || Date.now(),
        }),
      (err) =>
        errorRef.current(
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable",
        ),
      N.geolocation,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, attempt]);
}
