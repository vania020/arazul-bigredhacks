import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePublishedActivity } from "../activity/usePublishedActivity";
import { activityBubbles } from "../activity/areas";
import type { RecentFeed } from "../activity/recent-types";
const feed: RecentFeed = {
  areaId: "san-francisco",
  sourceId: "gnap-fj3t",
  checkedAt: new Date().toISOString(),
  windowStart: "2026-10-01T00:00:00",
  windowEnd: "2026-10-03T00:00:00",
  records: [],
  excludedRows: 0,
  limited: false,
};
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("activity privacy and lifecycle", () => {
  it("suppresses singleton cells and never outputs individual coordinates", () => {
    const record = {
      id: "one",
      point: [-122.4, 37.8] as [number, number],
      category: "Robbery",
      eventAt: "2026-10-02T01:00:00",
    };
    expect(activityBubbles({ ...feed, records: [record] }, "san-francisco")).toEqual([]);
    const bubbles = activityBubbles(
      { ...feed, records: [record, { ...record, id: "two" }] },
      "san-francisco",
    );
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]!.count).toBe(2);
    expect(bubbles[0]!.center).not.toEqual(record.point);
  });
  it("does not query unsupported cities or disabled feeds", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { rerender } = renderHook(({ city, enabled }) => usePublishedActivity(city, enabled), {
      initialProps: { city: "sao-paulo", enabled: true },
    });
    rerender({ city: "san-francisco", enabled: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts pending requests and exposes no bubbles immediately when switched off", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    );
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => usePublishedActivity("san-francisco", enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(signal).toBeDefined());
    act(() => rerender({ enabled: false }));
    expect(signal!.aborted).toBe(true);
    expect(result.current.feed).toBeNull();
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
