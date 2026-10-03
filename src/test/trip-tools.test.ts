import { describe, it, expect } from "vitest";
import {
  createTripUrl,
  parseTripUrl,
  buildTripSummary,
  type SharedTrip,
} from "@/services/trip-tools";
import type { ScoredRoute } from "@/types/route";
const trip: SharedTrip = {
  version: 1,
  cityId: "nyc",
  origin: { label: "<b>Home</b>", latLng: { lat: 0, lng: 0 } },
  destination: { label: "Station" },
  mode: "walking",
  hour: null,
  extraMinutes: 5,
};
const url = createTripUrl(trip, "https://example.com/?private=secret");
describe("trip links", () => {
  it("roundtrips labels and coordinates outside the incident grid using only the fragment", () => {
    expect(parseTripUrl(url)).toEqual(trip);
    expect(new URL(url).search).toBe("");
    expect(url).not.toContain("secret");
  });
  it.each(["&trip=1", "&unknown=x", "&originLat=4"])(
    "rejects duplicate or unknown fields %s",
    (suffix) => expect(parseTripUrl(url + suffix)).toBeNull(),
  );
  it.each([
    ["trip=1", "trip=2"],
    ["city=nyc", "city=unknown"],
    ["hour=now", "hour=24"],
    ["extra=5", "extra=16"],
    ["originLat=0", "originLat=91"],
    ["originLng=0", "originLng=NaN"],
    ["mode=walking", "mode=bicycling"],
    ["originLat=0", "originLat="],
    ["originLat=0", "originLat=Infinity"],
  ])("rejects malformed values %s", (before, after) =>
    expect(parseTripUrl(url.replace(before, after))).toBeNull(),
  );
  it("rejects malformed encodings, excessive size, missing coordinates and missing required fields", () => {
    for (const input of [
      url + "&x=%zz",
      url.replace("Station", "%FF"),
      url + "a".repeat(4096),
      url.replace("&originLng=0", ""),
      url.replace("hour=now&", ""),
    ])
      expect(parseTripUrl(input)).toBeNull();
  });
  it("bounds query labels and preserves plain text safely", () => {
    expect(() =>
      createTripUrl({ ...trip, origin: { label: "a".repeat(301) } }, "https://example.com"),
    ).toThrow();
    expect(parseTripUrl(url)?.origin.label).toBe("<b>Home</b>");
  });
});
describe("summary", () => {
  const route: ScoredRoute = {
    id: "route-1",
    source: "google",
    path: [{ lat: 12.345678, lng: 45.678912 }],
    distanceMeters: 1200,
    durationSec: 600,
    coverage: "unavailable",
    exposure: 900,
    index: 9,
    hotspots: [],
    hotspotMeters: 500,
    contributors: {},
  };
  it("exports an exact plain-text summary without unsupported scores or geometry", () => {
    expect(buildTripSummary({ trip, route, grid: null, comparisonAvailable: false }, "en")).toBe(
      "ARAZUL journey summary\nCity: New York City (America/New_York)\nOrigin: <b>Home</b>\nDestination: Station\nDeparture hour: Now (when recalculated)\nMode: Walking\nExtra-time budget: 5 min\nSelected route: route-1\nEstimated travel time: 10 min\nDistance: 1.2 km\nDataset source: Unavailable\nDataset period: Unavailable\n\nLinks contain your endpoints. Shared trips recalculate; routes and estimates can change.\nHistorical incidents do not guarantee safety. No route geometry is included.\n",
    );
  });
});

import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { TripTools } from "@/components/TripTools";
import { I18nProvider } from "@/i18n";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not share on render and shows a selectable link if clipboard access is denied", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const route = {
    id: "test",
    durationSec: 600,
    distanceMeters: 1000,
    coverage: "unavailable",
  } as ScoredRoute;
  render(
    createElement(
      I18nProvider,
      null,
      createElement(TripTools, { trip, route, grid: null, comparisonAvailable: false }),
    ),
  );
  expect(writeText).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Share trip" }));
  await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
  const input = screen.getByRole("textbox") as HTMLInputElement;
  expect(input.readOnly).toBe(true);
  expect(parseTripUrl(input.value)).toEqual(trip);
});
it("uses native sharing only after a click", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share });
  render(
    createElement(
      I18nProvider,
      null,
      createElement(TripTools, {
        trip,
        route: {} as ScoredRoute,
        grid: null,
        comparisonAvailable: false,
      }),
    ),
  );
  expect(share).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Share trip" }));
  await waitFor(() => expect(share).toHaveBeenCalledOnce());
  expect(parseTripUrl(share.mock.calls[0]![0].url)).toEqual(trip);
});
it("hides an old manual link when the trip changes", async () => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  const route = {} as ScoredRoute;
  const view = (value: SharedTrip) =>
    createElement(
      I18nProvider,
      null,
      createElement(TripTools, { trip: value, route, grid: null, comparisonAvailable: false }),
    );
  const { rerender } = render(view(trip));
  fireEvent.click(screen.getByRole("button", { name: "Share trip" }));
  await screen.findByRole("textbox");
  rerender(view({ ...trip, destination: { label: "New destination" } }));
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("includes provenance and only exports available historical exposure", () => {
  const route = {
    id: "selected",
    durationSec: 600,
    distanceMeters: 1200,
    coverage: "covered",
    index: 8,
    hotspotMeters: 200,
    path: [{ lat: 12.34567, lng: 76.54321 }],
  } as ScoredRoute;
  const grid = {
    isDemo: false,
    meta: { source: "Official published reports", period: "2025" },
  } as import("@/types/risk").RiskGrid;
  const summary = buildTripSummary({ trip, route, grid, comparisonAvailable: true }, "en");
  expect(summary).toContain(
    "Dataset source: Official published reports\nDataset period: 2025\nHistorical exposure index: 8\nElevated-exposure distance: 0.2 km",
  );
  expect(summary).not.toContain("12.34567");
  for (const props of [
    { trip, route, grid, comparisonAvailable: false },
    {
      trip,
      route: { ...route, coverage: "outside-coverage" as const },
      grid,
      comparisonAvailable: true,
    },
    { trip, route, grid: { ...grid, isDemo: true }, comparisonAvailable: true },
  ])
    expect(buildTripSummary(props, "en")).not.toContain("Historical exposure index:");
});
