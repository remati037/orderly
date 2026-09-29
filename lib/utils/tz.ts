const TZ = "Europe/Belgrade";

function tzOffsetMs(date: Date): number {
  const tzMs = new Date(date.toLocaleString("en-US", { timeZone: TZ })).getTime();
  const utcMs = new Date(date.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return tzMs - utcMs;
}

function tzMidnight(y: number, m: number, d: number): Date {
  const approx = new Date(Date.UTC(y, m, d));
  return new Date(approx.getTime() - tzOffsetMs(approx));
}

function todayInTZ(): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })
    .format(new Date())
    .split("-")
    .map(Number);
  return { y, m: m - 1, d };
}

export function dayBounds(offsetDays = 0) {
  const { y, m, d } = todayInTZ();
  const start = tzMidnight(y, m, d + offsetDays);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Same as dayBounds, but for an arbitrary date rather than "today ± offset" —
// used to find same-calendar-day orders around a specific timestamp.
export function dayBoundsForDate(date: Date) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })
    .format(date)
    .split("-")
    .map(Number);
  const start = tzMidnight(y, m - 1, d);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// "Today so far" vs "same elapsed time yesterday" — avoids comparing partial today to full yesterday.
export function todayComparisonBounds() {
  const now = new Date();
  const { y, m, d } = todayInTZ();
  const todayStart = tzMidnight(y, m, d);
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const yesterdaySameTime = new Date(now.getTime() - 86_400_000);
  return {
    current: { start: todayStart.toISOString(),     end: now.toISOString()                   },
    prev:    { start: yesterdayStart.toISOString(), end: yesterdaySameTime.toISOString()      },
  };
}

// "This month so far" vs "same elapsed days last month" — same idea as
// todayComparisonBounds, so a comparison on day 3 of the month doesn't stack
// 3 days of revenue against a full 31-day previous month.
export function monthToDateComparisonBounds() {
  const now = new Date();
  const { y, m } = todayInTZ();
  const monthStart = tzMidnight(y, m, 1);
  const prevMonthStart = tzMidnight(y, m - 1, 1);
  const prevMonthSameTime = new Date(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()));
  return {
    current:        { start: monthStart.toISOString(),     end: now.toISOString()               },
    prevSamePeriod: { start: prevMonthStart.toISOString(), end: prevMonthSameTime.toISOString()  },
  };
}

export function weekBounds(offsetWeeks = 0) {
  const { y, m, d } = todayInTZ();
  const dow = (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; // Mon=0…Sun=6
  const monday = d - dow + offsetWeeks * 7;
  const start = tzMidnight(y, m, monday);
  const end = tzMidnight(y, m, monday + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function monthBounds(offsetMonths = 0) {
  const { y, m } = todayInTZ();
  const start = tzMidnight(y, m + offsetMonths, 1);
  const end = tzMidnight(y, m + offsetMonths + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function yearBounds(offsetYears = 0) {
  const { y } = todayInTZ();
  const start = tzMidnight(y + offsetYears, 0, 1);
  const end = tzMidnight(y + offsetYears + 1, 0, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Returns current + matching previous period of equal length for trend comparison.
// fromDate / toDate are "YYYY-MM-DD" strings in Belgrade timezone.
export function customBounds(fromDate: string, toDate: string) {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const start = tzMidnight(fy, fm - 1, fd);
  const end   = tzMidnight(ty, tm - 1, td + 1); // exclusive end (next midnight)
  const dur   = end.getTime() - start.getTime();
  return {
    start:     start.toISOString(),
    end:       end.toISOString(),
    prevStart: new Date(start.getTime() - dur).toISOString(),
    prevEnd:   start.toISOString(),
  };
}

// "DD.MM" label of the Belgrade calendar day an instant falls on.
export function belgradeDayLabel(date: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit" })
    .formatToParts(new Date(date));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}`;
}

// Belgrade calendar day-of-month and month length for "now".
export function belgradeMonthProgress() {
  const { y, m, d } = todayInTZ();
  return { dayOfMonth: d, daysInMonth: new Date(Date.UTC(y, m + 1, 0)).getUTCDate() };
}

// Shifts an instant by calendar days / months / years in Belgrade wall-clock
// time, so "same time last month / last year" stays correct across DST.
// Days past the end of a shorter month clamp (Mar 31 − 1 month → Feb 28).
export function shiftBelgrade(
  iso: string,
  { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number }
): string {
  const date = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((p) => [p.type, Number(p.value)])
  ) as Record<string, number>;

  const y = parts.year + years;
  const m = parts.month - 1 + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(parts.day, lastDay) + days;

  const wall = Date.UTC(y, m, d, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds());
  // Wall-clock → instant: subtract Belgrade's offset at that moment.
  const approx = new Date(wall);
  return new Date(wall - tzOffsetMs(approx)).toISOString();
}
