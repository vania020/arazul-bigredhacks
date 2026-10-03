import { describe, expect, it } from "vitest";
import { nextOccurrenceOfHour } from "@/services/routingService";

describe("next local departure hour", () => {
  it.each([
    ["London spring missing hour", "Europe/London", "2026-03-29T00:30:12.345Z", 1, "2026-03-30T00:00:00.000Z"],
    ["London spring changed offset", "Europe/London", "2026-03-29T00:30:00Z", 3, "2026-03-29T02:00:00.000Z"],
    ["London fall repeated hour", "Europe/London", "2026-10-25T00:30:00Z", 1, "2026-10-25T01:00:00.000Z"],
    ["NYC spring missing hour", "America/New_York", "2026-03-08T06:30:00Z", 2, "2026-03-09T06:00:00.000Z"],
    ["NYC spring changed offset", "America/New_York", "2026-03-08T06:30:00Z", 3, "2026-03-08T07:00:00.000Z"],
    ["NYC fall repeated hour", "America/New_York", "2026-11-01T05:30:00Z", 1, "2026-11-01T06:00:00.000Z"],
    ["São Paulo ordinary day", "America/Sao_Paulo", "2026-10-03T12:15:37.432Z", 10, "2026-10-03T13:00:00.000Z"],
    ["Lima midnight", "America/Lima", "2026-10-03T23:45:00Z", 0, "2026-10-04T05:00:00.000Z"],
    ["quarter-hour offset", "Asia/Kathmandu", "2026-10-03T00:00:00Z", 6, "2026-10-03T00:15:00.000Z"],
    ["exact one-minute margin is skipped", "America/Lima", "2026-10-03T14:59:00Z", 10, "2026-10-04T15:00:00.000Z"],
    ["more than one minute is allowed", "America/Lima", "2026-10-03T14:58:59.999Z", 10, "2026-10-03T15:00:00.000Z"],
  ])("%s", (_name, zone, now, hour, expected) => {
    const result = nextOccurrenceOfHour(hour as number, zone as string, new Date(now as string));
    expect(result.toISOString()).toBe(expected);
    expect(result.getTime() - new Date(now as string).getTime()).toBeGreaterThan(60000);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it.each([-1, 24, 1.5, NaN, Infinity])("rejects invalid hour %s", hour => {
    expect(() => nextOccurrenceOfHour(hour, "Europe/London")).toThrow(RangeError);
  });
});
