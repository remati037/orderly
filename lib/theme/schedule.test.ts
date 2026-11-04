import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isNight,
  nextSwitch,
  parseOverride,
  resolveDark,
} from "./schedule";

const at = (hour: number, minute = 0, day = 4) => new Date(2026, 10, day, hour, minute);

describe("isNight", () => {
  it("is dark from 20:00 up to, but not including, 07:00", () => {
    expect(isNight(at(19, 59))).toBe(false);
    expect(isNight(at(20, 0))).toBe(true);
    expect(isNight(at(23, 30))).toBe(true);
    expect(isNight(at(0, 0))).toBe(true);
    expect(isNight(at(6, 59))).toBe(true);
    expect(isNight(at(7, 0))).toBe(false);
    expect(isNight(at(12, 0))).toBe(false);
  });
});

describe("nextSwitch", () => {
  it("points to 20:00 during the day", () => {
    expect(nextSwitch(at(7, 0))).toEqual(at(20, 0));
    expect(nextSwitch(at(14, 25))).toEqual(at(20, 0));
  });

  it("points to 07:00 the same morning after midnight", () => {
    expect(nextSwitch(at(1, 10))).toEqual(at(7, 0));
  });

  it("points to 07:00 the next morning in the evening", () => {
    expect(nextSwitch(at(20, 0))).toEqual(at(7, 0, 5));
    expect(nextSwitch(at(23, 59))).toEqual(at(7, 0, 5));
  });
});

describe("resolveDark", () => {
  it("follows the schedule without a manual choice", () => {
    expect(resolveDark(at(21), null)).toBe(true);
    expect(resolveDark(at(10), null)).toBe(false);
  });

  it("lets a manual choice win until it expires", () => {
    const off = { dark: false, until: at(7, 0, 5).getTime() };
    expect(resolveDark(at(22), off)).toBe(false);
    expect(resolveDark(at(7, 0, 5), off)).toBe(false); // expired, and it's day anyway

    const on = { dark: true, until: at(20).getTime() };
    expect(resolveDark(at(10), on)).toBe(true);
  });

  it("returns to the schedule the moment a manual choice expires", () => {
    const off = { dark: false, until: at(20).getTime() };
    expect(resolveDark(at(20), off)).toBe(true);
  });
});

describe("parseOverride", () => {
  it("rejects anything that isn't a valid choice", () => {
    expect(parseOverride(null)).toBeNull();
    expect(parseOverride("not json")).toBeNull();
    expect(parseOverride('{"dark":"yes","until":1}')).toBeNull();
    expect(parseOverride("null")).toBeNull();
  });

  it("reads a valid choice", () => {
    expect(parseOverride('{"dark":true,"until":5}')).toEqual({ dark: true, until: 5 });
  });
});

describe("THEME_INIT_SCRIPT", () => {
  afterEach(() => vi.useRealTimers());

  function runScript(now: Date, stored: string | null) {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const toggle = vi.fn();
    new Function("document", "localStorage", THEME_INIT_SCRIPT)(
      { documentElement: { classList: { toggle } } },
      { getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) },
    );
    return toggle.mock.calls[0];
  }

  it("agrees with resolveDark", () => {
    const cases: [Date, string | null][] = [
      [at(21), null],
      [at(10), null],
      [at(6, 59), null],
      [at(22), JSON.stringify({ dark: false, until: at(7, 0, 5).getTime() })],
      [at(10), JSON.stringify({ dark: true, until: at(20).getTime() })],
      [at(21), JSON.stringify({ dark: false, until: at(20).getTime() })], // expired
      [at(21), "not json"],
    ];
    for (const [now, stored] of cases) {
      expect(runScript(now, stored)).toEqual(["dark", resolveDark(now, parseOverride(stored))]);
    }
  });
});
