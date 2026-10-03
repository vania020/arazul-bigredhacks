import { useEffect } from "react";
import { cssColor } from "../map/cssColor";
import { activityArea, activityBubbles } from "./areas";
import { getRecentSource } from "./recent-reports";
import { activityCopy, type ActivityLanguage } from "./PublishedActivity";
import { formatSourceTime } from "./recent-bubbles";
import type { RecentFeed } from "./recent-types";
export function ActivityLayer({
  map,
  feed,
  cityId,
  language = "en",
}: {
  map: google.maps.Map | null;
  feed: RecentFeed | null;
  cityId: string;
  language?: ActivityLanguage;
}) {
  useEffect(() => {
    if (!map || !feed) return;
    const c = activityCopy[language];
    const source = getRecentSource(activityArea(cityId)?.cityId ?? "");
    const zone =
      source?.cityId === "sf"
        ? "America/Los_Angeles"
        : source?.cityId === "nyc"
          ? "America/New_York"
          : "America/Chicago";
    const info = new google.maps.InfoWindow();
    const overlays: google.maps.OverlayView[] = [];
    const circles = activityBubbles(feed, cityId).map((b) => {
      const center = { lng: b.center[0], lat: b.center[1] };
      const circle = new google.maps.Circle({
        map,
        center,
        radius: 110,
        fillColor: cssColor("--primary"),
        fillOpacity: 0.25,
        strokeColor: cssColor("--primary"),
        strokeOpacity: 0.9,
        strokeWeight: 2,
        zIndex: 3,
      });
      const open = () => {
        const content = document.createElement("div");
        content.style.color = cssColor("--foreground");
        content.style.maxWidth = "260px";
        const title = document.createElement("strong");
        title.textContent = `${b.count} ${c.count} · ~250 m`;
        content.append(title);
        for (const text of [
          source?.kind === "calls" ? c.calls : c.reports,
          c.privacy,
          ...b.categories.map((cat) => `${cat.name}: ${cat.count}`),
          `${formatSourceTime(b.firstAt)} — ${formatSourceTime(b.lastAt)} (${c.times}: ${zone})`,
          `${c.checked}: ${new Date(feed.checkedAt).toLocaleString(language)}`,
        ]) {
          const p = document.createElement("p");
          p.textContent = text;
          content.append(p);
        }
        info.setContent(content);
        info.setPosition(center);
        info.open({ map, shouldFocus: true });
      };
      circle.addListener("click", open);
      class Count extends google.maps.OverlayView {
        element: HTMLButtonElement | null = null;
        override onAdd() {
          const el = document.createElement("button");
          el.type = "button";
          el.textContent = String(b.count);
          el.setAttribute("aria-label", `${b.count} ${c.count} · ~250 m`);
          el.setAttribute("aria-haspopup", "dialog");
          Object.assign(el.style, {
            position: "absolute",
            transform: "translate(-50%, -50%)",
            border: "none",
            borderRadius: "999px",
            padding: "2px 6px",
            minWidth: "32px",
            minHeight: "32px",
            background: cssColor("--card"),
            color: cssColor("--foreground"),
            fontWeight: "700",
            cursor: "pointer",
          });
          el.onclick = open;
          google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);
          this.element = el;
          this.getPanes()?.overlayMouseTarget.append(el);
        }
        override draw() {
          const point = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(center));
          if (point && this.element) {
            this.element.style.left = `${point.x}px`;
            this.element.style.top = `${point.y}px`;
          }
        }
        override onRemove() {
          if (this.element) {
            this.element.onclick = null;
            google.maps.event.clearInstanceListeners(this.element);
            this.element.remove();
          }
          this.element = null;
        }
      }
      const count = new Count();
      count.setMap(map);
      overlays.push(count);
      return circle;
    });
    return () => {
      info.close();
      google.maps.event.clearInstanceListeners(info);
      circles.forEach((circle) => {
        google.maps.event.clearInstanceListeners(circle);
        circle.setMap(null);
      });
      overlays.forEach((overlay) => overlay.setMap(null));
    };
  }, [map, feed, cityId, language]);
  return null;
}
