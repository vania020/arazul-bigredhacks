import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPointPicker } from "@/map/MapPointPicker";
import { I18nProvider } from "@/i18n";

afterEach(cleanup);
function fixture() {
  let click:
    | ((event: { latLng: { toJSON: () => { lat: number; lng: number } } | null }) => void)
    | undefined;
  const remove = vi.fn();
  const center = { lat: 37.79, lng: -122.406 };
  const map = {
    get: vi.fn(() => "grab"),
    setOptions: vi.fn(),
    addListener: vi.fn((_event: string, callback: typeof click) => {
      click = callback;
      return { remove };
    }),
    getCenter: vi.fn(() => ({ toJSON: () => center })),
  };
  const onPick = vi.fn(),
    onCancel = vi.fn();
  const view = render(
    <I18nProvider>
      <MapPointPicker
        map={map as unknown as google.maps.Map}
        kind="origin"
        onPick={onPick}
        onCancel={onCancel}
      />
    </I18nProvider>,
  );
  return {
    ...view,
    map,
    remove,
    onPick,
    onCancel,
    center,
    click: (point: { lat: number; lng: number } | null) =>
      click?.({ latLng: point ? { toJSON: () => point } : null }),
  };
}

describe("map point picker", () => {
  it("selects the clicked coordinate and ignores clicks without a point", () => {
    const f = fixture();
    expect(f.map.setOptions).toHaveBeenCalledWith({ draggableCursor: "crosshair" });
    expect(f.map.addListener).toHaveBeenCalledWith("click", expect.any(Function));
    f.click(null);
    expect(f.onPick).not.toHaveBeenCalled();
    f.click({ lat: 40.7, lng: -73.9 });
    expect(f.onPick).toHaveBeenCalledExactlyOnceWith({ lat: 40.7, lng: -73.9 });
  });
  it("provides a keyboard-accessible map center selection", () => {
    const f = fixture();
    const button = screen.getByRole("button", { name: "Use map center" });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(f.onPick).toHaveBeenCalledExactlyOnceWith(f.center);
    expect(f.onCancel).not.toHaveBeenCalled();
  });
  it("cancels with Escape, but ignores unrelated keys", () => {
    const f = fixture();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(f.onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(f.onCancel).toHaveBeenCalledTimes(1);
    expect(f.onPick).not.toHaveBeenCalled();
  });
  it("removes the map listener and keyboard handler and restores the cursor on unmount", () => {
    const f = fixture();
    f.unmount();
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.map.setOptions).toHaveBeenLastCalledWith({ draggableCursor: "grab" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(f.onCancel).not.toHaveBeenCalled();
  });
});
