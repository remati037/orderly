import { dayBounds, todayComparisonBounds, weekBounds, monthBounds, yearBounds, customBounds } from "./tz";

export interface Bounds { start: string; end: string }

// Shift a window back one day or one month (used only for the "today" view,
// where the comparison basis is user-selectable).
function shiftBack(b: Bounds, compare: string): Bounds {
  const shift = (iso: string): string => {
    const d = new Date(iso);
    if (compare === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 1); // default: previous day
    return d.toISOString();
  };
  return { start: shift(b.start), end: shift(b.end) };
}

// Current window + its natural comparison window for each preset.
// "today" uses the day/month compare toggle; every other preset compares to
// its own previous period (month→prev month, week→prev week, …).
export function periodBounds(
  preset: string,
  from: string | null,
  to: string | null,
  compare: string
): { current: Bounds; prev: Bounds } {
  switch (preset) {
    case "yesterday":
      return { current: dayBounds(-1), prev: dayBounds(-2) };
    case "this_week":
      return { current: weekBounds(0), prev: weekBounds(-1) };
    case "this_month":
      return { current: monthBounds(0), prev: monthBounds(-1) };
    case "this_year":
      return { current: yearBounds(0), prev: yearBounds(-1) };
    case "custom":
      if (from && to) {
        const b = customBounds(from, to);
        return {
          current: { start: b.start,     end: b.end     },
          prev:    { start: b.prevStart, end: b.prevEnd },
        };
      }
      return { current: dayBounds(0), prev: dayBounds(-1) };
    default: { // "today" — partial day, comparison basis is selectable
      const current = todayComparisonBounds().current;
      return { current, prev: shiftBack(current, compare) };
    }
  }
}
