import {
  dayBounds, todayComparisonBounds, monthToDateComparisonBounds, weekBounds,
  monthBounds, yearBounds, customBounds, shiftBelgrade,
} from "./tz";

export interface Bounds { start: string; end: string }

// prev  — the same stretch one period earlier (yesterday for a day, last week
//         for a week, …), cut at the same elapsed point for periods in progress
// month — the same stretch one calendar month earlier
// year  — the same stretch one year earlier
export type CompareMode = "prev" | "month" | "year";

export function parseCompare(v: string | null | undefined): CompareMode {
  if (v === "month" || v === "year") return v;
  return "prev"; // also the old "day" value
}

// Which comparisons make sense per preset (the first one is the default).
export function compareOptions(preset: string): CompareMode[] {
  switch (preset) {
    case "today":
    case "yesterday":  return ["prev", "month", "year"];
    case "this_year":  return ["prev"];
    default:           return ["prev", "year"];
  }
}

const PREV_SHIFT: Record<string, { days?: number; months?: number; years?: number }> = {
  today:      { days: -1 },
  yesterday:  { days: -1 },
  this_week:  { days: -7 },
  this_month: { months: -1 },
  this_year:  { years: -1 },
};

const shift = (b: Bounds, by: { days?: number; months?: number; years?: number }): Bounds => ({
  start: shiftBelgrade(b.start, by),
  end: shiftBelgrade(b.end, by),
});

// Human label for "vs …" on the KPI cards.
export function compareLabel(preset: string, compare: CompareMode): string {
  if (compare === "year") return "prošla godina";
  if (compare === "month") return "prošli mesec";
  switch (preset) {
    case "today":      return "juče";
    case "yesterday":  return "prekjuče";
    case "this_week":  return "prošla nedelja";
    case "this_month": return "prošli mesec";
    case "this_year":  return "prošla godina";
    default:           return "prethodni period";
  }
}

// current: the selected window, ending "now" for periods still in progress.
// prev:    the comparison window — same length, so trend % is fair.
// prevFull: for this_month only, the whole previous month (shown as a total).
export function periodBounds(
  preset: string,
  from: string | null,
  to: string | null,
  compareRaw: string
): { current: Bounds; prev: Bounds; prevFull?: Bounds } {
  const allowed = compareOptions(preset);
  const compare = allowed.includes(parseCompare(compareRaw)) ? parseCompare(compareRaw) : allowed[0];
  const now = new Date().toISOString();

  let current: Bounds;
  let prevShift: { days?: number; months?: number; years?: number } | null = PREV_SHIFT[preset] ?? null;
  let prevFull: Bounds | undefined;
  let prevCustom: Bounds | undefined;

  switch (preset) {
    case "yesterday":
      current = dayBounds(-1);
      break;
    case "this_week": {
      const w = weekBounds(0);
      current = { start: w.start, end: now < w.end ? now : w.end };
      break;
    }
    case "this_month":
      current = monthToDateComparisonBounds().current;
      prevFull = monthBounds(-1);
      break;
    case "this_year": {
      const y = yearBounds(0);
      current = { start: y.start, end: now < y.end ? now : y.end };
      break;
    }
    case "custom":
      if (from && to) {
        const b = customBounds(from, to);
        current = { start: b.start, end: b.end };
        prevCustom = { start: b.prevStart, end: b.prevEnd };
        prevShift = null;
        break;
      }
      current = todayComparisonBounds().current;
      prevShift = { days: -1 };
      break;
    default: // "today" — so far today
      current = todayComparisonBounds().current;
  }

  let prev: Bounds;
  if (compare === "year") prev = shift(current, { years: -1 });
  else if (compare === "month") prev = shift(current, { months: -1 });
  else prev = prevCustom ?? shift(current, prevShift ?? { days: -1 });

  return { current, prev, prevFull };
}
