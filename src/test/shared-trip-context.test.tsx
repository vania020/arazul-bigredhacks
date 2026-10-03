import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CityProvider, useCity } from "@/context/CityContext";
import { createTripUrl, type SharedTrip } from "@/services/trip-tools";
const trip: SharedTrip = {
  version: 1,
  cityId: "nyc",
  origin: { label: "Home" },
  destination: { label: "Station" },
  mode: "walking",
  hour: 12,
  extraMinutes: 4,
};
function State() {
  const c = useCity();
  return (
    <>
      <output data-testid="state">
        {JSON.stringify({
          city: c.city.id,
          incomingTrip: c.incomingTrip,
          error: !!c.sharedTripError,
          activityEnabled: c.activityEnabled,
        })}
      </output>
      <button onClick={() => c.setActivityEnabled(false)}>Off</button>
      <button onClick={() => c.setCity("london")}>London</button>
      <button onClick={c.clearIncomingTrip}>Consume</button>
    </>
  );
}
function state() {
  return JSON.parse(screen.getByTestId("state").textContent!);
}
function mount() {
  render(
    <CityProvider>
      <State />
    </CityProvider>,
  );
}
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
describe("shared trip context", () => {
  it("loads a valid initial fragment and removes endpoints from the address bar", async () => {
    window.history.replaceState(null, "", createTripUrl(trip, window.location.href));
    mount();
    await waitFor(() => expect(state().incomingTrip).toEqual(trip));
    expect(state().city).toBe("nyc");
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByText("Consume"));
    expect(state().incomingTrip).toBeNull();
  });
  it("rejects malformed trips without changing city", async () => {
    window.history.replaceState(null, "", "/#trip=2&city=nyc");
    mount();
    await waitFor(() => expect(state().error).toBe(true));
    expect(state().city).toBe("sao-paulo");
    expect(state().incomingTrip).toBeNull();
    expect(window.location.hash).toBe("");
  });
  it("preserves activity Off across incoming trips and explicit city switches", async () => {
    mount();
    fireEvent.click(screen.getByText("Off"));
    window.history.replaceState(null, "", createTripUrl(trip, window.location.href));
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(state().city).toBe("nyc"));
    expect(state().activityEnabled).toBe(false);
    fireEvent.click(screen.getByText("London"));
    expect(state()).toEqual({
      city: "london",
      incomingTrip: null,
      error: false,
      activityEnabled: false,
    });
  });
});
