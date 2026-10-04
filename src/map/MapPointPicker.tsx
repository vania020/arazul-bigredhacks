import { Macaw } from "@/components/brand/Macaw";
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
      <div className="pointer-events-none absolute left-3 right-16 top-3 z-10 max-w-sm rounded-xl border bg-card p-3 shadow-soft flex items-start gap-2">
        <Macaw className="h-16 w-16 shrink-0" label="Ara" />
        <div className="min-w-0 flex-1">
          <p role="status" className="text-sm font-semibold">
            {kind === "origin" ? c.pickOrigin : c.pickDestination}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="pointer-events-auto min-h-11 rounded-lg border px-3 text-sm"
            >
              {c.cancel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
