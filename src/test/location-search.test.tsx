import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationSearch } from "@/components/LocationSearch";
import { I18nProvider } from "@/i18n";
import type { LocationValue } from "@/types/route";
const mocks = vi.hoisted(() => ({
  suggest: vi.fn(),
  changed: vi.fn(),
  city: { countryCode: "us", center: { lat: 37.79, lng: -122.4 }, searchRadiusM: 12000 },
}));
vi.mock("@/context/CityContext", () => ({ useCity: () => ({ city: mocks.city }) }));
vi.mock("@/services/googleMaps", () => ({
  importLib: async () => ({
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: mocks.suggest },
    AutocompleteSessionToken: class {},
  }),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function Harness() {
  const [value, setValue] = useState<LocationValue>({ label: "" });
  return (
    <I18nProvider>
      <LocationSearch
        id="origin"
        kind="origin"
        mapsReady
        value={value}
        onChange={(next) => {
          mocks.changed(next);
          setValue(next);
        }}
        onPick={() => setValue({ label: "Map point", latLng: { lat: 1, lng: 2 } })}
      />
      <button
        onClick={() => setValue({ label: "External destination", latLng: { lat: 3, lng: 4 } })}
      >
        Swap/demo
      </button>
    </I18nProvider>
  );
}
const type = async (query: string) => {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
};
const suggestion = (fetchFields: () => Promise<void> = vi.fn().mockResolvedValue(undefined)) => ({
  placePrediction: {
    mainText: "Old place",
    text: "Old place",
    toPlace: () => ({ fetchFields, location: { lat: () => 9, lng: () => 9 } }),
  },
});
beforeEach(() => {
  vi.useFakeTimers();
  mocks.suggest.mockReset();
  mocks.changed.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("location search asynchronous selection", () => {
  it("discards an older query after typing a new query", async () => {
    const old = deferred<{ suggestions: unknown[] }>();
    mocks.suggest.mockReturnValueOnce(old.promise).mockResolvedValue({ suggestions: [] });
    render(<Harness />);
    await type("Old");
    await type("New");
    await act(async () => old.resolve({ suggestions: [suggestion()] }));
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveValue("New");
  });
  it.each(["Pick on map", "Swap/demo"])(
    "does not overwrite %s with a pending place detail",
    async (button) => {
      const detail = deferred<void>();
      mocks.suggest.mockResolvedValue({ suggestions: [suggestion(() => detail.promise)] });
      render(<Harness />);
      await type("Old");
      fireEvent.click(screen.getByRole("button", { name: "Old place" }));
      const pickButton =
        button === "Pick on map"
          ? screen.getByRole("button", { name: /Choose on map:/i })
          : screen.getByRole("button", { name: button });
      fireEvent.click(pickButton);
      await act(async () => detail.resolve());
      expect(screen.getByRole("combobox")).toHaveValue(
        button === "Swap/demo" ? "External destination" : "Map point",
      );
      expect(mocks.changed).not.toHaveBeenCalledWith(
        expect.objectContaining({ latLng: { lat: 9, lng: 9 } }),
      );
    },
  );
  it("ignores pending details after unmount", async () => {
    const detail = deferred<void>();
    mocks.suggest.mockResolvedValue({ suggestions: [suggestion(() => detail.promise)] });
    const view = render(<Harness />);
    await type("Old");
    fireEvent.click(screen.getByRole("button", { name: "Old place" }));
    const calls = mocks.changed.mock.calls.length;
    view.unmount();
    await act(async () => detail.resolve());
    expect(mocks.changed).toHaveBeenCalledTimes(calls);
  });
});
