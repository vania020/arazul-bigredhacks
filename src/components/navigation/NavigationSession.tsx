/// <reference types="google.maps" />
import { createPortal } from "react-dom";
import { LocateFixed } from "lucide-react";
import { useI18n } from "@/i18n";
import { RoutePolyline } from "@/map/RoutePolyline";
import { RouteEndpoints } from "@/map/RouteEndpoints";
import { useNavigation, type NavTrip } from "@/navigation/useNavigation";
import type { Units } from "@/navigation/format";
import type { RiskGrid } from "@/types/risk";
import type { ScoredRoute } from "@/types/route";
import { NavigationBanner } from "./NavigationBanner";
import { NavigationPanel } from "./NavigationPanel";

interface Props {
  map: google.maps.Map;
  trip: NavTrip;
  grid: RiskGrid | null;
  units: Units;
  isMobile: boolean;
  /**
   * Desktop: the side panel element to render the instruction + trip panel into, so the map
   * stays large. Null on phones (floating top card + bottom sheet over the map).
   */
  panelHost?: HTMLElement | null;
  onRouteChange: (route: ScoredRoute) => void;
  exposureLayer: { available: boolean; on: boolean; toggle: () => void };
  onEnd: () => void;
}

const noop = () => {};

/**
 * Live navigation over the existing map. Owns all GPS-driven state, so position updates only
 * re-render this subtree; the map, risk grid and planning state above it are untouched.
 * The layout (docked side panel vs floating phone UI) can change without restarting it.
 */
export function NavigationSession({
  map,
  trip,
  grid,
  units,
  isMobile,
  panelHost = null,
  onRouteChange,
  exposureLayer,
  onEnd,
}: Props) {
  const { t, lang } = useI18n();
  const nav = useNavigation({ map, trip, grid, lang, units, onRouteChange });
  const { nav: route } = nav.active;
  const docked = !!panelHost;
  const banner = (
    <NavigationBanner
      copy={nav.copy}
      status={nav.status}
      gps={nav.gps}
      progress={nav.progress}
      nav={route}
      units={units}
      destination={trip.destination.label}
      notice={nav.notice}
      rerouteBlocked={nav.rerouteBlocked}
      routeIssue={nav.routeIssue}
      recalcReady={nav.recalcReady}
      onRecalculate={nav.recalculate}
      onRetry={nav.retryGps}
      docked={docked}
    />
  );
  const panel = (
    <NavigationPanel
      copy={nav.copy}
      status={nav.status}
      progress={nav.progress}
      active={nav.active}
      preference={trip.preference}
      prefLabel={nav.prefLabel}
      extraMin={trip.extraMin}
      units={units}
      destination={trip.destination.label}
      startedAt={nav.startedAt}
      arrivedAt={nav.arrivedAt}
      isMobile={isMobile}
      docked={docked}
      following={nav.following}
      onRecenter={nav.recenter}
      voice={nav.voice}
      exposureLayer={exposureLayer}
      onEnd={onEnd}
    />
  );
  return (
    <>
      <RoutePolyline map={map} path={route.path} selected onClick={noop} />
      <RouteEndpoints
        map={map}
        start={route.path[0]!}
        end={route.destination}
        startLabel={t("startLabel")}
        endLabel={t("endLabel")}
        startAddress=""
        endAddress={trip.destination.label}
        showStart={false}
      />
      {panelHost ? (
        <>
          {createPortal(
            <div className="space-y-3">
              {banner}
              {panel}
            </div>,
            panelHost,
          )}
          {!nav.following && nav.status !== "arrived" && nav.status !== "error" && (
            <button
              type="button"
              onClick={nav.recenter}
              className="absolute bottom-6 right-6 z-20 flex h-12 items-center gap-2 rounded-full border bg-card px-4 text-sm font-bold text-primary shadow-float"
            >
              <LocateFixed aria-hidden className="h-5 w-5" />
              {nav.copy.recenter}
            </button>
          )}
        </>
      ) : (
        <>
          {banner}
          {panel}
        </>
      )}
    </>
  );
}
