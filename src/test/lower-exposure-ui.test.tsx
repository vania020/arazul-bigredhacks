import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { LowerExposureOption } from "@/components/LowerExposureOption";
import { CityProvider, useCity } from "@/context/CityContext";
import { I18nProvider, useI18n, type Lang } from "@/i18n";
import type { RiskGrid } from "@/types/risk";
import type { CandidateRoute, ScoredRoute } from "@/types/route";

const mocks = vi.hoisted(() => ({ computeRoutes: vi.fn(), loadRiskGrid: vi.fn() }));
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
vi.mock("@/map/MapView", () => ({ MapView: () => <div data-testid="map" /> }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

// One row of 100 m cells; each route is a 60 m path inside its own cell, so exposure = value × 60.
const ORIGIN = { lat: -23.7, lng: -46.8 };
const M_LNG = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const VALUES = [100, 90, 71, 96];
const grid: RiskGrid = {
  meta: {
    cellSizeM: 100,
    originLat: ORIGIN.lat,
    originLon: ORIGIN.lng,
    rows: 1,
    cols: VALUES.length,
    buckets: ["0", "6", "12", "18"],
    modes: ["walking", "driving"],
    source: "fixture",
    period: "fixture",
    incidentsUsed: 10,
    timeResolution: "six-hour",
  },
  cells: Object.fromEntries(
    VALUES.map((v, c) => [`0_${c}`, { walking: [v, v, v, v], driving: [v, v, v, v] }]),
  ),
  isDemo: false,
};
const inCell = (id: string, col: number, minutes: number): CandidateRoute => ({
  id,
  source: "google",
  path: [
    { lat: ORIGIN.lat + 50 / 111320, lng: ORIGIN.lng + (col * 100 + 20) / M_LNG },
    { lat: ORIGIN.lat + 50 / 111320, lng: ORIGIN.lng + (col * 100 + 80) / M_LNG },
  ],
  distanceMeters: 60,
  durationSec: minutes * 60,
});
// Fastest 20 min; A +4 min (10% lower); B +9 min (29% lower); C +7 min (only 4% lower).
const routes = [inCell("fast", 0, 20), inCell("A", 1, 24), inCell("B", 2, 29), inCell("C", 3, 27)];

function KeyedShell() {
  const { city } = useCity();
  return <AppShell key={city.id} />;
}
const mount = () =>
  render(
    <I18nProvider>
      <CityProvider>
        <KeyedShell />
      </CityProvider>
    </I18nProvider>,
  );
async function search() {
  fireEvent.click(screen.getByRole("button", { name: /Try a demo trip/ }));
  fireEvent.click(screen.getByRole("button", { name: /Find routes/ }));
  return screen.findByRole("radiogroup", { name: "Routes" });
}
const option = () => screen.queryByRole("region", { name: "Lower-exposure option" });

let time = 1795000000000;
beforeEach(() => {
  mocks.computeRoutes.mockReset().mockResolvedValue(routes);
  mocks.loadRiskGrid.mockReset().mockResolvedValue(grid);
  vi.spyOn(Date, "now").mockReturnValue((time += 600000)); // fresh route-cache window per test
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("lower-exposure option outside the time budget", () => {
  it("keeps the recommendation within +5 min and shows the +9 min route separately", async () => {
    mount();
    const chips = await search();
    // Recommendation obeys the budget (A is only 10% lower, so the fastest stays recommended).
    expect(within(chips).getByRole("radio", { name: /20 min/ })).toHaveTextContent(/Recommended/i);
    expect(within(chips).queryByRole("radio", { name: /29 min/ })).not.toBeInTheDocument();
    const card = option()!;
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("29 min");
    expect(card).toHaveTextContent("+9 min vs fastest");
    expect(card).toHaveTextContent("↓ 29% reported exposure");
    expect(card).toHaveTextContent("4 min beyond your current +5 min limit");
    // The 4%-lower route outside the budget is not surfaced.
    expect(card).not.toHaveTextContent("27 min");
    expect(card).not.toHaveTextContent(/safer/i);
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1); // no extra Google requests
  });

  it("selects exactly that route and raises the budget to match when chosen", async () => {
    mount();
    const chips = await search();
    fireEvent.click(
      within(option()!).getByRole("button", { name: /Use this route \(allow \+9 min\)/ }),
    );
    await waitFor(() => expect(option()).not.toBeInTheDocument());
    expect(screen.getByLabelText("Maximum extra travel time")).toHaveValue("9");
    const chosen = within(chips).getByRole("radio", { name: /29 min/ });
    expect(chosen).toHaveAttribute("aria-checked", "true");
    // Within the new +9 allowance the normal policy recommends it (29% ≥ 15%).
    expect(chosen).toHaveTextContent(/Recommended/i);
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("hands the route to the normal recommendation once the slider allows it", async () => {
    mount();
    const chips = await search();
    expect(option()).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Maximum extra travel time"), {
      target: { value: "10" },
    });
    await waitFor(() => expect(option()).not.toBeInTheDocument());
    expect(within(chips).getByRole("radio", { name: /29 min/ })).toHaveTextContent(/Recommended/i);
    // Back below +9: it becomes an outside-budget option again.
    fireEvent.change(screen.getByLabelText("Maximum extra travel time"), {
      target: { value: "6" },
    });
    await waitFor(() =>
      expect(option()).toHaveTextContent("3 min beyond your current +6 min limit"),
    );
    expect(mocks.computeRoutes).toHaveBeenCalledTimes(1);
  });

  it("shows nothing for a city without incident data", async () => {
    mocks.loadRiskGrid.mockResolvedValue(null);
    mount();
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "lima" } });
    await search();
    expect(option()).not.toBeInTheDocument();
    expect(screen.queryByText(/% reported exposure/)).not.toBeInTheDocument();
  });
});

describe("lower-exposure option copy", () => {
  const scored = {
    ...inCell("B", 2, 29),
    coverage: "covered",
    exposure: 71,
    index: 0,
    hotspots: [],
    hotspotMeters: 0,
    contributors: {},
  } as ScoredRoute;
  function Lang({ lang }: { lang: Lang }) {
    const { setLang } = useI18n();
    useEffect(() => setLang(lang), [lang, setLang]);
    return null;
  }
  it.each([
    [
      "en",
      "Lower-exposure option",
      "+9 min vs fastest",
      "4 min beyond your current +5 min limit",
      "Use this route (allow +9 min)",
    ],
    [
      "pt",
      "Opção com menor exposição",
      "+9 min em relação à mais rápida",
      "4 min além do seu limite atual de +5 min",
      "Usar esta rota (permitir +9 min)",
    ],
    [
      "es",
      "Opción con menor exposición",
      "+9 min frente a la más rápida",
      "4 min por encima de tu límite actual de +5 min",
      "Usar esta ruta (permitir +9 min)",
    ],
  ] as const)("renders %s", async (lang, title, vs, beyond, use) => {
    const onUse = vi.fn();
    render(
      <I18nProvider>
        <Lang lang={lang} />
        <LowerExposureOption
          options={[
            { route: scored, extraMin: 9, overLimitMin: 4, allowMin: 9, improvementPct: 29 },
          ]}
          budget={5}
          onUse={onUse}
        />
      </I18nProvider>,
    );
    const card = await screen.findByRole("region", { name: title });
    expect(card).toHaveTextContent(vs);
    expect(card).toHaveTextContent(beyond);
    expect(card).toHaveTextContent("↓ 29%");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: use })));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ extraMin: 9 }));
  });
});
