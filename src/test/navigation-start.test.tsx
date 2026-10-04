import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { NavigationErrorBoundary } from "@/components/navigation/NavigationErrorBoundary";
import { CityProvider } from "@/context/CityContext";
import { I18nProvider } from "@/i18n";
import type { CandidateRoute, LatLng } from "@/types/route";
import type { RiskGrid } from "@/types/risk";
import { cellKey } from "@/services/exposureService";

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
  loadRiskGrid: vi.fn(),
}));
vi.mock("@/activity", () => ({
  usePublishedActivity: () => ({ feed: null, status: "disabled" }),
  ActivityLayer: () => null,
  PublishedActivity: () => null,
}));
vi.mock("@/services/googleMaps", () => ({ getApiKey: () => "test-key", importLib: vi.fn() }));
vi.mock("@/services/riskDataService", () => ({ loadRiskGrid: mocks.loadRiskGrid }));
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
  mocks.loadRiskGrid.mockReset().mockResolvedValue(null);
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
  vi.restoreAllMocks();
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

  it("asks Google for steps on the same geometry when the route has none", async () => {
    const { steps: _steps, ...geometryOnly } = route;
    // AppShell's route cache is shared per 5-minute window: move to a fresh window.
    const now = Date.now() + 3_600_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.computeRoutes
      .mockReset()
      .mockResolvedValueOnce([geometryOnly]) // planning search: no steps
      .mockResolvedValueOnce([{ ...route, id: "google-steps" }]); // via-waypoint request
    render(
      <I18nProvider>
        <CityProvider>
          <AppShell />
        </CityProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Try a demo trip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Start navigation" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Head north on Rua A" })).toBeInTheDocument(),
    );
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(2);
    const [q] = mocks.computeRoutes.mock.calls[1]!;
    expect(q.intermediates).toHaveLength(8);
    expect(q.alternatives).toBe(false);
  });
});

describe("explicitly chosen lower-exposure route", () => {
  it("navigates the outside-budget route the user chose, with its own steps", async () => {
    // Same endpoints; the alternative goes east first: +9 min but through lower-exposure cells.
    const lower: CandidateRoute = {
      id: "lower",
      source: "detour",
      label: "Bypass 1 · east (balanced)",
      path: [at(0), at(0, 300), at(300, 300)],
      distanceMeters: 600,
      durationSec: route.durationSec + 9 * 60,
      steps: [
        {
          instruction: "Head east on Rua C",
          maneuver: "DEPART",
          distanceMeters: 300,
          durationSec: 400,
          path: [at(0), at(0, 300)],
        },
        {
          instruction: "Turn left onto Rua D",
          maneuver: "TURN_LEFT",
          distanceMeters: 300,
          durationSec: 440,
          path: [at(0, 300), at(300, 300)],
        },
      ],
    };
    // 50 m grid around the start: the fastest route's cells score 100, the alternative's 40.
    const meta = {
      cellSizeM: 50,
      originLat: BASE.lat - 0.005,
      originLon: BASE.lng - 0.005,
      rows: 40,
      cols: 40,
      buckets: ["0", "6", "12", "18"],
      modes: ["walking", "driving"] as ("walking" | "driving")[],
      source: "fixture",
      period: "fixture",
      incidentsUsed: 10,
    };
    const grid: RiskGrid = { meta, cells: {}, isDemo: false };
    const paint = (r: CandidateRoute, v: number) => {
      for (let i = 1; i < r.path.length; i++)
        for (let k = 0; k <= 30; k++) {
          const a = r.path[i - 1]!,
            b = r.path[i]!;
          const p = {
            lat: a.lat + ((b.lat - a.lat) * k) / 30,
            lng: a.lng + ((b.lng - a.lng) * k) / 30,
          };
          grid.cells[cellKey(grid, p.lat, p.lng)] = {
            walking: [v, v, v, v],
            driving: [v, v, v, v],
          };
        }
    };
    paint(route, 100);
    paint(lower, 40);
    mocks.loadRiskGrid.mockResolvedValue(grid);
    mocks.computeRoutes.mockReset().mockResolvedValue([route, lower]);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 7_200_000); // fresh route-cache window
    render(
      <I18nProvider>
        <CityProvider>
          <AppShell />
        </CityProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Try a demo trip/ }));
    fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
    const card = await screen.findByRole("region", { name: "Lower-exposure option" });
    expect(card).toHaveTextContent("+9 min vs fastest");
    fireEvent.click(within(card).getByRole("button", { name: /Use this route/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Start navigation" }));
    // The banner shows the chosen route's own Google step, not the fastest route's.
    expect(await screen.findByRole("region", { name: "Head east on Rua C" })).toBeInTheDocument();
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
  });
});

describe("navigation error boundary", () => {
  it("contains a navigation crash and lets the user end the session", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onEnd = vi.fn();
    const Broken = () => {
      throw new Error("boom");
    };
    render(
      <NavigationErrorBoundary message="Navigation stopped" endLabel="End navigation" onEnd={onEnd}>
        <Broken />
      </NavigationErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Navigation stopped");
    fireEvent.click(screen.getByRole("button", { name: "End navigation" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
