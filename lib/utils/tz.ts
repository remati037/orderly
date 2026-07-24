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
