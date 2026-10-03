import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { CityProvider, useCity } from "@/context/CityContext";
import { I18nProvider } from "@/i18n";
import type { CandidateRoute } from "@/types/route";

const mocks = vi.hoisted(() => ({ computeRoutes: vi.fn(), loadRiskGrid: vi.fn() }));
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
vi.mock("@/map/MapView", () => ({ MapView: () => <div data-testid="map" /> }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

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
function selectCity(id: string) {
  fireEvent.change(screen.getByLabelText("City"), { target: { value: id } });
}
function demoSearch() {
  fireEvent.click(screen.getByRole("button", { name: /Try a demo trip/ }));
  fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
}
const route = (id: string, seconds = 600): CandidateRoute => ({
  id,
  source: "google",
  durationSec: seconds,
  distanceMeters: 1200,
  path: [
    { lat: -12.1211, lng: -77.0305 },
    { lat: -12.1316, lng: -77.0301 },
  ],
});
let time = 1791000000000;
beforeEach(() => {
  mocks.computeRoutes.mockReset();
  mocks.loadRiskGrid.mockReset().mockResolvedValue(null);
  // AppShell's route cache is intentionally shared; give every test a separate cache window.
  vi.spyOn(Date, "now").mockReturnValue((time += 600000));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("city routing state", () => {
  it("ignores an old city's response after switching cities while routing is pending", async () => {
    let resolveOld!: (routes: CandidateRoute[]) => void;
    mocks.computeRoutes.mockImplementationOnce(
      () =>
        new Promise<CandidateRoute[]>((resolve) => {
          resolveOld = resolve;
        }),
    );
    mount();
    selectCity("nyc");
    demoSearch();
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
    selectCity("lima");
    await act(async () => {
      resolveOld([route("old-nyc", 2220)]);
    });
    expect(screen.getByLabelText("City")).toHaveValue("lima");
    expect(screen.getByRole("button", { name: /Find routes/ })).toBeInTheDocument();
    expect(screen.queryByText(/37 min/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grand Central/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start route/ })).not.toBeInTheDocument();
    mocks.computeRoutes.mockResolvedValueOnce([route("new-lima")]);
    demoSearch();
    expect(await screen.findByText(/→ Larcomar/)).toBeInTheDocument();
  });

  it("routes the Lima sample without exposure claims or hourly-condition feedback", async () => {
    mocks.computeRoutes.mockResolvedValue([route("lima")]);
    mount();
    selectCity("lima");
    demoSearch();
    expect(await screen.findByText(/→ Larcomar/)).toBeInTheDocument();
    expect(screen.getAllByText("Exposure comparison unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\d+%.*reported.*exposure/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d.*elevated/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Hour" }), { target: { value: "8" } });
    expect(screen.queryByText(/Updated for .* conditions/)).not.toBeInTheDocument();
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("retains the successful walking snapshot when a driving reroute fails", async () => {
    mocks.computeRoutes
      .mockResolvedValueOnce([route("walking")])
      .mockRejectedValueOnce(new Error("ZERO_RESULTS"));
    mount();
    selectCity("lima");
    demoSearch();
    await screen.findByText(/→ Larcomar/);
    fireEvent.click(screen.getByRole("radio", { name: "Car / Rideshare" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ZERO_RESULTS"));
    expect(screen.getByRole("radio", { name: "Walking" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Car / Rideshare" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText(/→ Larcomar/)).toBeInTheDocument();
  });
});
