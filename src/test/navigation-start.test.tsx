import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { CityProvider } from "@/context/CityContext";
import { I18nProvider } from "@/i18n";
import type { CandidateRoute, LatLng } from "@/types/route";

// Lightest practical shell: real AppShell + navigation UI, with Google drawing stubbed out.
const mocks = vi.hoisted(() => ({
  computeRoutes: vi.fn(),
  map: {
    fitBounds: vi.fn(),
    setOptions: vi.fn(),
    panTo: vi.fn(),
    setZoom: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  marker: { update: vi.fn(), remove: vi.fn() },
}));
vi.mock("@/activity", () => ({
  usePublishedActivity: () => ({ feed: null, status: "disabled" }),
  ActivityLayer: () => null,
  PublishedActivity: () => null,
}));
vi.mock("@/services/googleMaps", () => ({ getApiKey: () => "test-key", importLib: vi.fn() }));
vi.mock("@/services/riskDataService", () => ({ loadRiskGrid: vi.fn().mockResolvedValue(null) }));
vi.mock("@/services/routingService", () => ({
  computeRoutes: mocks.computeRoutes,
  currentHourIn: () => 12,
  nextOccurrenceOfHour: () => new Date("2026-10-03T22:00:00Z"),
  describeGoogleError: (error: Error) => error.message,
}));
vi.mock("@/services/detourService", () => ({
  generateDetours: vi.fn().mockResolvedValue([]),
  dedupeRoutes: (routes: CandidateRoute[]) => routes,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/map/MapView", () => ({
  MapView: ({ onReady }: { onReady: (m: unknown) => void }) => {
    useEffect(() => onReady(mocks.map), [onReady]);
    return <div data-testid="map" />;
  },
}));
vi.mock("@/map/RoutePolyline", () => ({ RoutePolyline: () => null }));
vi.mock("@/map/RouteEndpoints", () => ({ RouteEndpoints: () => null }));
vi.mock("@/map/LocationMarker", () => ({ createLocationMarker: () => mocks.marker }));

// São Paulo demo origin (MASP); 300 m north, then 300 m east.
const BASE = { lat: -23.5614, lng: -46.6559 };
const at = (north: number, east = 0): LatLng => ({
  lat: BASE.lat + north / 111320,
  lng: BASE.lng + east / (111320 * Math.cos((BASE.lat * Math.PI) / 180)),
});
const route: CandidateRoute = {
  id: "planned",
  source: "google",
  path: [at(0), at(300), at(300, 300)],
  distanceMeters: 600,
  durationSec: 300,
  steps: [
    {
      instruction: "Head north on Rua A",
      maneuver: "DEPART",
      distanceMeters: 300,
      durationSec: 150,
      path: [at(0), at(300)],
    },
    {
      instruction: "Turn right onto Rua B",
      maneuver: "TURN_RIGHT",
      distanceMeters: 300,
      durationSec: 150,
      path: [at(300), at(300, 300)],
    },
  ],
};

let onPosition: PositionCallback = () => {};
const geolocation = {
  watchPosition: vi.fn((success: PositionCallback) => {
    onPosition = success;
    return 7;
  }),
  clearWatch: vi.fn(),
};
const position = (p: LatLng) =>
  ({
    coords: { latitude: p.lat, longitude: p.lng, accuracy: 8, heading: null, speed: null },
    timestamp: Date.now(),
  }) as unknown as GeolocationPosition;

beforeEach(() => {
  vi.stubGlobal("google", {
    maps: {
      LatLngBounds: class {
        extend() {
          return this;
        }
      },
    },
  });
  Object.defineProperty(navigator, "geolocation", { value: geolocation, configurable: true });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  mocks.computeRoutes.mockReset().mockResolvedValue([route]);
  geolocation.watchPosition.mockClear();
  geolocation.clearWatch.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("in-app navigation start", () => {
  it("starts navigation on the selected Arazul route and ends cleanly", async () => {
    render(
      <I18nProvider>
        <CityProvider>
          <AppShell />
        </CityProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Try a demo trip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
    const start = await screen.findByRole("button", { name: "Start navigation" });
    // No location tracking before the user starts navigation.
    expect(geolocation.watchPosition).not.toHaveBeenCalled();

    fireEvent.click(start);
    expect(await screen.findByRole("button", { name: "End navigation" })).toBeInTheDocument();
    // The banner shows Google's step for exactly the selected route.
    expect(screen.getByRole("region", { name: "Head north on Rua A" })).toBeInTheDocument();
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1); // starting costs no extra request

    act(() => onPosition(position(at(0))));
    act(() => onPosition(position(at(80))));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Turn right onto Rua B" })).toBeInTheDocument(),
    );
    expect(mocks.marker.update).toHaveBeenCalled();
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1); // GPS updates are handled locally

    fireEvent.click(screen.getByRole("button", { name: "End navigation" }));
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(mocks.marker.remove).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start navigation" })).toBeInTheDocument();
  });
});
