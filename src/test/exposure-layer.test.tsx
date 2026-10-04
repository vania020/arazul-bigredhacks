import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ExposureLayer } from "@/map/ExposureLayer";
import { validateRiskGrid } from "@/services/riskDataService";
import type { RiskCell, RiskGrid } from "@/types/risk";
import chicagoAsset from "../../public/data/chicago.json";
import sfAsset from "../../public/data/san-francisco.json";
import londonAsset from "../../public/data/london.json";
import { nycNative, nycNativeAsset } from "./nycFixtures";

type Props = ComponentProps<typeof ExposureLayer>;
type Bounds = [west: number, south: number, east: number, north: number];
const colors = ["#ddf3ff", "#8ed1fc", "#ffd166", "#f78c6b", "#d94b64", "#8e3b5d"];
const cell = (values: number[] = [1.5, 1.5, 1.5, 1.5]): RiskCell => ({
  walking: values,
  driving: [...values],
});
function grid(cells: RiskGrid["cells"] = { "0_0": cell() }): RiskGrid {
  return {
    isDemo: false,
    meta: {
      originLat: 0,
      originLon: 0,
      cellSizeM: 111.32,
      rows: 10,
      cols: 10,
      coverageBounds: [0, 0, 0.01, 0.01],
      modes: ["walking", "driving"],
      buckets: ["0", "6", "12", "18"],
      source: "fixture",
      period: "historical",
      incidentsUsed: 1,
    },
    cells,
  };
}

function mapFixture(initialBounds: Bounds = [-0.001, -0.001, 0.011, 0.011]) {
  let bounds = initialBounds;
  let zoom = 14;
  const pane = document.createElement("div");
  pane.dataset["testMap"] = "true";
  document.body.appendChild(pane);
  Object.defineProperties(pane, {
    clientWidth: { value: 1200 },
    clientHeight: { value: 1200 },
  });
  const paints: { alpha: number; color: string; x: number; y: number; w: number; h: number }[] = [];
  // Canvas calls in order, so tests can check that fills happen inside a clip.
  const calls: string[] = [];
  const clipPath: [number, number][] = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    beginPath: vi.fn(() => clipPath.splice(0)),
    moveTo: vi.fn((x: number, y: number) => clipPath.push([x, y])),
    lineTo: vi.fn((x: number, y: number) => clipPath.push([x, y])),
    closePath: vi.fn(),
    clip: vi.fn((rule: string) => calls.push(`clip:${rule}`)),
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push("fill");
      paints.push({ alpha: this.globalAlpha, color: this.fillStyle, x, y, w, h });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  class LatLng {
    constructor(
      private latitude: number,
      private longitude: number,
    ) {}
    lat() {
      return this.latitude;
    }
    lng() {
      return this.longitude;
    }
  }
  const projection = {
    fromLatLngToDivPixel(point: LatLng) {
      return { x: point.lng() * 100000, y: -point.lat() * 100000 };
    },
  };
  const detach = vi.fn();
  class OverlayView {
    onAdd() {}
    onRemove() {}
    draw() {}
    getProjection() {
      return projection;
    }
    getPanes() {
      return { overlayLayer: pane };
    }
    setMap(map: unknown) {
      if (map) {
        this.onAdd();
        this.draw();
      } else {
        detach();
        this.onRemove();
      }
    }
  }
  vi.stubGlobal("google", { maps: { OverlayView, LatLng } });
  const listeners = new Map<string, Set<() => void>>();
  const removals: ReturnType<typeof vi.fn>[] = [];
  const map = {
    getDiv: () => pane,
    getZoom: () => zoom,
    getBounds: () => ({
      getSouthWest: () => new LatLng(bounds[1], bounds[0]),
      getNorthEast: () => new LatLng(bounds[3], bounds[2]),
    }),
    addListener: vi.fn((event: string, callback: () => void) => {
      const callbacks = listeners.get(event) ?? new Set<() => void>();
      callbacks.add(callback);
      listeners.set(event, callbacks);
      const remove = vi.fn(() => callbacks.delete(callback));
      removals.push(remove);
      return { remove };
    }),
  };
  return {
    map: map as unknown as google.maps.Map,
    pane,
    paints,
    ctx,
    calls,
    clipPath,
    detach,
    removals,
    setZoom: (value: number) => {
      zoom = value;
    },
    setBounds: (value: Bounds) => {
      bounds = value;
    },
    idle: () => act(() => listeners.get("idle")?.forEach((callback) => callback())),
  };
}

function mount(f: ReturnType<typeof mapFixture>, overrides: Partial<Props> = {}) {
  const props: Props = {
    map: f.map,
    grid: grid(),
    mode: "walking",
    hour: 12,
    route: undefined,
    scope: "city",
    onStatus: vi.fn(),
    ...overrides,
  };
  const view = render(<ExposureLayer {...props} />);
  return {
    ...view,
    props,
    update: (changes: Partial<Props>) => {
      Object.assign(props, changes);
      view.rerender(<ExposureLayer {...props} />);
    },
  };
}

beforeEach(() => {
  colors.forEach((color, i) => document.documentElement.style.setProperty(`--exp-${i + 1}`, color));
});
afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-test-map]").forEach((element) => element.remove());
  colors.forEach((_, i) => document.documentElement.style.removeProperty(`--exp-${i + 1}`));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("exposure heatmap rendering", () => {
  it("keeps low-value cells visible at the minimum supported zoom", () => {
    const f = mapFixture();
    f.setZoom(13);
    const view = mount(f);
    expect(f.paints).toHaveLength(1);
    expect(f.paints[0]!.alpha).toBeGreaterThanOrEqual(0.25);
    expect(f.paints[0]!.color).toBe(colors[0]);
    expect(f.paints[0]!.w).toBeGreaterThan(0);
    expect(f.paints[0]!.h).toBeGreaterThan(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it("uses the dataset display scale for visibility and color without changing its values", () => {
    const f = mapFixture();
    const normalized = grid({ "0_0": cell([0.5, 0.5, 0.5, 0.5]) });
    const view = mount(f, { grid: normalized });
    expect(f.paints).toHaveLength(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("empty");
    view.update({ grid: { ...normalized, meta: { ...normalized.meta, displayScale: 24 } } });
    expect(f.paints).toHaveLength(1);
    expect(f.paints[0]!.color).toBe(colors[3]);
    expect(normalized.cells["0_0"]!.walking).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it.each([
    ["chicago", chicagoAsset],
    ["san-francisco", sfAsset],
    ["london", londonAsset],
  ] as const)("renders the published %s dataset at perceptible opacity", (cityId, asset) => {
    const data = validateRiskGrid(asset, cityId);
    const f = mapFixture(data.meta.coverageBounds!);
    const view = mount(f, { grid: data });
    expect(f.paints.length).toBeGreaterThan(0);
    expect(f.paints.every((paint) => paint.alpha >= 0.25 && paint.alpha <= 1)).toBe(true);
    expect(f.paints.every((paint) => colors.includes(paint.color))).toBe(true);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("ready");
    expect(f.ctx.clip).not.toHaveBeenCalled(); // Unguarded cities keep their rectangular overlay.
  });

  it("clips the published NYC dataset to its borough polygons before painting", () => {
    const data = nycNative();
    const f = mapFixture([-74.03, 40.7, -73.96, 40.78]); // Lower/Midtown Manhattan and the Hudson
    const view = mount(f, { grid: data });
    expect(f.paints.length).toBeGreaterThan(0);
    expect(f.paints.every((paint) => colors.includes(paint.color))).toBe(true);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("ready");
    const first = f.calls.indexOf("fill");
    expect(f.calls.slice(0, first)).toEqual(["save", "clip:evenodd"]);
    expect(f.calls.at(-1)).toBe("restore");
    expect(f.calls.filter((c) => c === "save")).toHaveLength(1);
    // The clip outline is the official polygon, projected to the canvas.
    const tl = { x: -74.03 * 100000, y: -40.78 * 100000 };
    const vertices = data.coverageGeometry!.features.flatMap((feature) =>
      (feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
      ).flat(2),
    );
    const projected = new Set(
      vertices.map(([lng, lat]) => `${lng! * 100000 - tl.x},${-lat! * 100000 - tl.y}`),
    );
    expect(f.clipPath.length).toBeGreaterThan(0);
    expect(f.clipPath.every(([x, y]) => projected.has(`${x},${y}`))).toBe(true);
  });

  it("paints nothing over New Jersey inside the NYC bounding rectangle", () => {
    const data = nycNative();
    const [w, s, e, n] = data.meta.coverageBounds!;
    const jerseyCity: Bounds = [-74.075, 40.71, -74.045, 40.73];
    expect(jerseyCity[0] > w && jerseyCity[2] < e && jerseyCity[1] > s && jerseyCity[3] < n).toBe(
      true,
    );
    const f = mapFixture(jerseyCity);
    const view = mount(f, { grid: data });
    expect(f.paints).toHaveLength(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("outside-coverage");
  });

  it("hides a polygon-guarded overlay whose boundary did not load", () => {
    const { coverageGeometry: _missing, ...unguarded } = nycNative();
    const f = mapFixture([-74.03, 40.7, -73.96, 40.78]);
    const view = mount(f, { grid: unguarded });
    expect(f.paints).toHaveLength(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("unavailable");
  });

  it("keeps displayScale a rendering factor for NYC: stored values stay in [0,1]", () => {
    const data = nycNative();
    expect(data.meta.displayScale).toBe(24);
    expect(data.cells).toEqual(nycNativeAsset().cells);
  });

  it("restricts route scope to its corridor and restores distant cells in city scope", () => {
    const f = mapFixture();
    const view = mount(f, {
      grid: grid({ "0_0": cell(), "1_1": cell(), "8_8": cell() }),
      scope: "route",
      route: [
        { lat: 0.0003, lng: 0.0003 },
        { lat: 0.0007, lng: 0.0007 },
      ],
    });
    expect(f.paints).toHaveLength(2);
    expect(f.paints.every((paint) => paint.x < 400)).toBe(true);
    f.paints.length = 0;
    view.update({ scope: "city" });
    expect(f.paints).toHaveLength(3);
    expect(f.paints.some((paint) => paint.x > 800)).toBe(true);
  });

  it("redraws the selected historical time window", () => {
    const f = mapFixture();
    const view = mount(f, { grid: grid({ "0_0": cell([1, 1, 1, 20]) }), hour: 0 });
    expect(f.paints.at(-1)!.color).toBe(colors[1]);
    view.update({ hour: 18 });
    expect(f.paints.at(-1)!.color).toBe(colors[3]);
    expect(f.pane.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("preserves CSS dimensions while drawing at the device pixel ratio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const f = mapFixture();
    mount(f);
    const canvas = screen.getByTestId("exposure-heatmap") as HTMLCanvasElement;
    expect(canvas.width).toBe(Number.parseFloat(canvas.style.width) * 2);
    expect(canvas.height).toBe(Number.parseFloat(canvas.style.height) * 2);
    expect(f.ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(canvas.style.pointerEvents).toBe("none");
  });

  it("reports zoom and coverage restrictions after moving the map and recovers on return", () => {
    const f = mapFixture();
    const view = mount(f);
    f.paints.length = 0;
    f.setZoom(12);
    f.idle();
    expect(f.paints).toHaveLength(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("zoom-in");
    f.setZoom(14);
    f.setBounds([1, 1, 1.01, 1.01]);
    f.idle();
    expect(f.paints).toHaveLength(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("outside-coverage");
    f.setBounds([-0.001, -0.001, 0.011, 0.011]);
    f.idle();
    expect(f.paints).toHaveLength(1);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("ready");
  });

  it("reports an empty visible area without confusing it with unavailable coverage", () => {
    const f = mapFixture();
    const view = mount(f, { grid: grid({ "0_0": cell([0, 0, 0, 0]) }) });
    expect(f.paints).toHaveLength(0);
    expect(view.props.onStatus).toHaveBeenLastCalledWith("empty");
  });

  it("removes the canvas and map listeners when the layer is switched off", () => {
    const f = mapFixture();
    const view = mount(f);
    const canvas = screen.getByTestId("exposure-heatmap");
    expect(canvas).toBeInTheDocument();
    view.unmount();
    expect(canvas).not.toBeInTheDocument();
    expect(f.detach).toHaveBeenCalledTimes(1);
    expect(f.removals.length).toBeGreaterThan(0);
    expect(f.removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
    const paintCount = f.paints.length;
    f.idle();
    expect(f.paints).toHaveLength(paintCount);
  });
});
