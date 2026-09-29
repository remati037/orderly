import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareLabel, compareOptions, parseCompare, periodBounds } from "./kpi-period";
import { shiftBelgrade } from "./tz";

afterEach(() => vi.useRealTimers());

describe("shiftBelgrade", () => {
  it("keeps Belgrade wall-clock time across DST", () => {
    // Nov 1 00:00 Belgrade (UTC+1) − 1 month → Oct 1 00:00 Belgrade (UTC+2)
    expect(shiftBelgrade("2026-10-31T23:00:00.000Z", { months: -1 })).toBe("2026-09-30T22:00:00.000Z");
  });
  it("clamps to the end of shorter months", () => {
    // Mar 31 12:00 Belgrade − 1 month → Feb 28 12:00 Belgrade (UTC+1)
    expect(shiftBelgrade("2026-03-31T10:00:00.000Z", { months: -1 })).toBe("2026-02-28T11:00:00.000Z");
  });
  it("shifts by days and years", () => {
    expect(shiftBelgrade("2026-09-29T10:00:00.000Z", { days: -7 })).toBe("2026-09-22T10:00:00.000Z");
    expect(shiftBelgrade("2026-09-29T10:00:00.000Z", { years: -1 })).toBe("2025-09-29T10:00:00.000Z");
  });
});

describe("periodBounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Tuesday 29.09.2026 14:00 Belgrade
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
  });

  it("today vs yesterday up to the same time", () => {
    const { current, prev } = periodBounds("today", null, null, "prev");
    expect(current).toEqual({ start: "2026-09-28T22:00:00.000Z", end: "2026-09-29T12:00:00.000Z" });
    expect(prev).toEqual({ start: "2026-09-27T22:00:00.000Z", end: "2026-09-28T12:00:00.000Z" });
  });

  it("accepts the legacy 'day' value as prev", () => {
    expect(periodBounds("today", null, null, "day").prev.start).toBe("2026-09-27T22:00:00.000Z");
  });

  it("this week so far vs last week to the same point", () => {
    const { current, prev } = periodBounds("this_week", null, null, "prev");
    expect(current.start).toBe("2026-09-27T22:00:00.000Z"); // Monday 28.09
    expect(current.end).toBe("2026-09-29T12:00:00.000Z");
    expect(prev).toEqual({ start: "2026-09-20T22:00:00.000Z", end: "2026-09-22T12:00:00.000Z" });
  });

  it("this month so far vs last month to the same day, plus the full last month", () => {
    const { current, prev, prevFull } = periodBounds("this_month", null, null, "prev");
    expect(current.start).toBe("2026-08-31T22:00:00.000Z");
    expect(prev).toEqual({ start: "2026-07-31T22:00:00.000Z", end: "2026-08-29T12:00:00.000Z" });
    expect(prevFull).toEqual({ start: "2026-07-31T22:00:00.000Z", end: "2026-08-31T22:00:00.000Z" });
  });

  it("same period last year", () => {
    const { prev } = periodBounds("this_month", null, null, "year");
    expect(prev).toEqual({ start: "2025-08-31T22:00:00.000Z", end: "2025-09-29T12:00:00.000Z" });
  });

  it("this year so far vs last year to the same date", () => {
    const { current, prev } = periodBounds("this_year", null, null, "prev");
    expect(current.start).toBe("2025-12-31T23:00:00.000Z");
    expect(prev).toEqual({ start: "2024-12-31T23:00:00.000Z", end: "2025-09-29T12:00:00.000Z" });
  });

  it("custom range vs the preceding window of equal length, or last year", () => {
    const p = periodBounds("custom", "2026-09-01", "2026-09-10", "prev");
    expect(p.current).toEqual({ start: "2026-08-31T22:00:00.000Z", end: "2026-09-10T22:00:00.000Z" });
    expect(p.prev).toEqual({ start: "2026-08-21T22:00:00.000Z", end: "2026-08-31T22:00:00.000Z" });
    expect(periodBounds("custom", "2026-09-01", "2026-09-10", "year").prev.start).toBe("2025-08-31T22:00:00.000Z");
  });

  it("falls back to the preset's default when a mode doesn't apply", () => {
    // 'month' isn't offered for this_week → prev (last week)
    expect(periodBounds("this_week", null, null, "month").prev.start).toBe("2026-09-20T22:00:00.000Z");
  });
});

describe("labels and options", () => {
  it("names the comparison per preset", () => {
    expect(compareLabel("today", "prev")).toBe("juče");
    expect(compareLabel("this_week", "prev")).toBe("prošla nedelja");
    expect(compareLabel("this_month", "year")).toBe("prošla godina");
    expect(compareLabel("custom", "prev")).toBe("prethodni period");
  });
  it("offers only meaningful modes", () => {
    expect(compareOptions("today")).toEqual(["prev", "month", "year"]);
    expect(compareOptions("this_year")).toEqual(["prev"]);
    expect(parseCompare("garbage")).toBe("prev");
  });
});
