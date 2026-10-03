import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { TimeOfDayComparison } from "@/components/TimeOfDayComparison";
import type { RiskGrid } from "@/types/risk";
const grid: RiskGrid = {
  isDemo: false,
  meta: {
    cellSizeM: 1000,
    originLat: 0,
    originLon: 0,
    rows: 1,
    cols: 1,
    buckets: ["0", "6", "12", "18"],
    modes: ["walking"],
    source: "fixture",
    period: "historical",
    incidentsUsed: 1,
    timeResolution: "six-hour",
  },
  cells: { "0_0": { walking: [10, 20, 30, 40], driving: [10, 20, 30, 40] } },
};
afterEach(cleanup);
describe("time window selection", () => {
  it("offers four accessible compact windows before routing and selects representative hours", () => {
    const onHourChange = vi.fn();
    render(
      <I18nProvider>
        <TimeOfDayComparison
          route={null}
          grid={grid}
          mode="walking"
          hour={10}
          timeZone="America/New_York"
          onHourChange={onHourChange}
        />
      </I18nProvider>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Morning/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Evening/ }));
    expect(onHourChange).toHaveBeenCalledWith(18);
    expect(screen.getByText(/Choose a route/)).toBeInTheDocument();
    expect(screen.queryByText(/not a crime prediction/)).not.toBeInTheDocument();
  });
  it.each(["all-day", "missing", "unsupported"])(
    "does not offer fabricated windows for %s data",
    (kind) => {
      const data =
        kind === "missing"
          ? null
          : {
              ...grid,
              meta: {
                ...grid.meta,
                timeResolution: kind === "all-day" ? ("all-day" as const) : ("six-hour" as const),
              },
            };
      render(
        <I18nProvider>
          <TimeOfDayComparison
            route={null}
            grid={data}
            mode={kind === "unsupported" ? "driving" : "walking"}
            hour={10}
            timeZone="Europe/London"
            onHourChange={vi.fn()}
          />
        </I18nProvider>,
      );
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      if (kind === "all-day")
        expect(screen.getByText(/monthly source has no time-of-day data/)).toBeInTheDocument();
    },
  );
});
