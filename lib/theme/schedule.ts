// Night mode schedule: dark from 20:00 until 07:00, on the device's own clock.
//
// A manual choice wins only until the next scheduled switch. If it lasted
// forever, one click would quietly turn the automatic schedule off for good.

export const NIGHT_START_HOUR = 20;
export const NIGHT_END_HOUR = 7;
export const THEME_STORAGE_KEY = "orderly-theme";

export interface ThemeOverride {
  dark: boolean;
  until: number; // epoch ms
}

export function isNight(now: Date): boolean {
  const hour = now.getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

// The next moment the schedule flips, always strictly after `now`.
export function nextSwitch(now: Date): Date {
  const hour = now.getHours();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  if (hour < NIGHT_END_HOUR) {
    next.setHours(NIGHT_END_HOUR);
  } else if (hour < NIGHT_START_HOUR) {
    next.setHours(NIGHT_START_HOUR);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(NIGHT_END_HOUR);
  }
  return next;
}

export function parseOverride(raw: string | null): ThemeOverride | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.dark === "boolean" && typeof parsed?.until === "number") {
      return { dark: parsed.dark, until: parsed.until };
    }
  } catch {
    // Unreadable value: fall through to the schedule.
  }
  return null;
}

export function resolveDark(now: Date, override: ThemeOverride | null): boolean {
  if (override && override.until > now.getTime()) return override.dark;
  return isNight(now);
}

// Runs in <head> before the first paint so a night visit never flashes white.
// It can't import the helpers above, so it repeats resolveDark in plain JS;
// schedule.test.ts runs this string to keep the two in step.
export const THEME_INIT_SCRIPT = `(function(){
  var dark, now = new Date(), hour = now.getHours();
  dark = hour >= ${NIGHT_START_HOUR} || hour < ${NIGHT_END_HOUR};
  try {
    var saved = JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}));
    if (saved && typeof saved.dark === "boolean" && typeof saved.until === "number" && saved.until > now.getTime()) dark = saved.dark;
  } catch (e) {}
  document.documentElement.classList.toggle("dark", dark);
})();`;
