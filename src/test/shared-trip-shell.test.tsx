import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { CityProvider, useCity } from "@/context/CityContext";
import { I18nProvider } from "@/i18n";
import type { CandidateRoute } from "@/types/route";
import { createTripUrl, type SharedTrip } from "@/services/trip-tools";
const mocks = vi.hoisted(() => ({ computeRoutes: vi.fn(), loadRiskGrid: vi.fn() }));
vi.mock("@/services/googleMaps", () => ({ getApiKey: () => "test-key", importLib: vi.fn() }));
vi.mock("@/services/riskDataService", () => ({ loadRiskGrid: mocks.loadRiskGrid }));
vi.mock("@/services/routingService", () => ({
  computeRoutes: mocks.computeRoutes,
  currentHourIn: () => 12,
  nextOccurrenceOfHour: () => new Date("2026-10-03T22:00:00Z"),
  describeGoogleError: (e: Error) => e.message,
}));
vi.mock("@/services/detourService", () => ({
  generateDetours: vi.fn().mockResolvedValue([]),
  dedupeRoutes: (r: CandidateRoute[]) => r,
}));
vi.mock("@/map/MapView", () => ({ MapView: () => <div data-testid="map" /> }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/activity", () => ({
  usePublishedActivity: () => ({ feed: null }),
  PublishedActivity: () => null,
  ActivityLayer: () => null,
}));
function KeyedShell() {
  const { city } = useCity();
  return <AppShell key={city.id} />;
}
function mount() {
  render(
    <I18nProvider>
      <CityProvider>
        <KeyedShell />
      </CityProvider>
    </I18nProvider>,
  );
}
const trip: SharedTrip = {
  version: 1,
  cityId: "nyc",
  origin: { label: "Shared start", latLng: { lat: 40.751, lng: -73.99 } },
  destination: { label: "Shared finish", latLng: { lat: 40.76, lng: -73.97 } },
  mode: "walking",
  hour: 8,
  extraMinutes: 7,
};
beforeEach(() => {
  mocks.computeRoutes.mockReset().mockResolvedValue([]);
  mocks.loadRiskGrid.mockReset().mockResolvedValue(null);
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});
describe("shared-trip shell", () => {
  it("prefills the chosen city without autorouting and preserves coordinates on submission", async () => {
    window.history.replaceState(null, "", createTripUrl(trip, window.location.href));
    mount();
    await screen.findByDisplayValue("Shared start");
    expect(screen.getByDisplayValue("Shared finish")).toBeInTheDocument();
    expect(screen.getByLabelText("City")).toHaveValue("nyc");
    expect(screen.getByRole("combobox", { name: "Hour" })).toHaveValue("8");
    expect(mocks.computeRoutes).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
    await waitFor(() => expect(mocks.computeRoutes).toHaveBeenCalledTimes(1));
    expect(mocks.computeRoutes).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: trip.origin,
        destination: trip.destination,
        mode: "walking",
      }),
    );
  });
  it("replaces an existing city with a received trip without autorouting", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "london" } });
    await act(async () => {
      window.history.replaceState(null, "", createTripUrl(trip, window.location.href));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByDisplayValue("Shared start")).toBeInTheDocument();
    expect(screen.getByLabelText("City")).toHaveValue("nyc");
    expect(mocks.computeRoutes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
    await waitFor(() => expect(mocks.computeRoutes).toHaveBeenCalledTimes(1));
    expect(mocks.computeRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ origin: trip.origin, destination: trip.destination }),
    );
  });
});
