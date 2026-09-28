import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { belgradeDayLabel, belgradeMonthProgress, customBounds, dayBounds, monthBounds } from "./tz";

afterEach(() => vi.useRealTimers());

describe("Belgrade day boundaries (server in UTC)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 00:30 in Belgrade on Sep 29 (CEST, UTC+2) — still Sep 28 in UTC.
    vi.setSystemTime(new Date("2026-09-28T22:30:00Z"));
  });

  it("'today' is the Belgrade calendar day, not the UTC one", () => {
    expect(dayBounds(0)).toEqual({ start: "2026-09-28T22:00:00.000Z", end: "2026-09-29T22:00:00.000Z" });
    expect(dayBounds(-1).start).toBe("2026-09-27T22:00:00.000Z");
  });

  it("month bounds follow Belgrade midnight", () => {
    expect(monthBounds(0)).toEqual({ start: "2026-08-31T22:00:00.000Z", end: "2026-09-30T22:00:00.000Z" });
    expect(belgradeMonthProgress()).toEqual({ dayOfMonth: 29, daysInMonth: 30 });
  });
});

describe("DST", () => {
  it("handles the winter offset (UTC+1)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
    expect(dayBounds(0).start).toBe("2026-12-14T23:00:00.000Z");
  });
});

describe("customBounds / belgradeDayLabel", () => {
  it("custom dates are inclusive Belgrade days with an exclusive end", () => {
    const b = customBounds("2026-09-01", "2026-09-30");
    expect(b.start).toBe("2026-08-31T22:00:00.000Z");
    expect(b.end).toBe("2026-09-30T22:00:00.000Z");
    expect(b.prevEnd).toBe(b.start);
  });

  it("labels an instant with its Belgrade day", () => {
    expect(belgradeDayLabel("2026-09-28T22:30:00Z")).toBe("29.09");
    expect(belgradeDayLabel("2026-09-28T21:59:59Z")).toBe("28.09");
  });
});
