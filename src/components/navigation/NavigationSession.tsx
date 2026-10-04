/// <reference types="google.maps" />
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
  onRouteChange: (route: ScoredRoute) => void;
  exposureLayer: { available: boolean; on: boolean; toggle: () => void };
  onEnd: () => void;
}

const noop = () => {};

/**
 * Live navigation over the existing map. Owns all GPS-driven state, so position updates only
 * re-render this subtree; the map, risk grid and planning state above it are untouched.
 */
export function NavigationSession({
  map,
  trip,
  grid,
  units,
  isMobile,
  onRouteChange,
  exposureLayer,
  onEnd,
}: Props) {
  const { t, lang } = useI18n();
  const nav = useNavigation({ map, trip, grid, lang, units, onRouteChange });
  const { nav: route } = nav.active;
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
      />
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
        following={nav.following}
        onRecenter={nav.recenter}
        voice={nav.voice}
        exposureLayer={exposureLayer}
        onEnd={onEnd}
      />
    </>
  );
}
