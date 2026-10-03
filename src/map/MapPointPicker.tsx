import { useEffect } from "react";
import { useI18n } from "@/i18n";
import { planningCopy } from "@/i18n/planning";
import type { LatLng } from "@/types/route";
export function MapPointPicker({
  map,
  kind,
  onPick,
  onCancel,
}: {
  map: google.maps.Map;
  kind: "origin" | "destination";
  onPick: (point: LatLng) => void;
  onCancel: () => void;
}) {
  const { lang } = useI18n();
  const c = planningCopy[lang];
  useEffect(() => {
    const cursor = map.get("draggableCursor");
    map.setOptions({ draggableCursor: "crosshair" });
    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onPick(e.latLng.toJSON());
    });
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", escape);
    return () => {
      listener.remove();
      window.removeEventListener("keydown", escape);
      map.setOptions({ draggableCursor: cursor });
    };
  }, [map, onPick, onCancel]);
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card/80 p-1 text-xl text-primary"
      >
        +
      </div>
      <div className="absolute left-3 right-16 top-3 z-10 max-w-sm rounded-xl border bg-card p-3 shadow-soft">
        <p role="status" className="text-sm font-semibold">
          {kind === "origin" ? c.pickOrigin : c.pickDestination}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const center = map.getCenter();
              if (center) onPick(center.toJSON());
            }}
            className="min-h-11 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
          >
            {c.center}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border px-3 text-sm"
          >
            {c.cancel}
          </button>
        </div>
      </div>
    </>
  );
}
