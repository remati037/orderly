import { THEME_STORAGE_KEY, nextSwitch, parseOverride, resolveDark } from "./schedule";

const listeners = new Set<() => void>();

function readOverride() {
  try {
    return parseOverride(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null; // storage blocked: the schedule still works
  }
}

export function isDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyTheme(): void {
  const dark = resolveDark(new Date(), readOverride());
  if (dark === isDarkNow()) return;
  document.documentElement.classList.toggle("dark", dark);
  listeners.forEach((listener) => listener());
}

// The manual switch: holds until the next scheduled flip, then the schedule
// takes over again.
export function setDarkManually(dark: boolean): void {
  const now = new Date();
  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ dark, until: nextSwitch(now).getTime() }),
    );
  } catch {
    // Storage blocked: applied below for this page view only.
  }
  document.documentElement.classList.toggle("dark", dark);
  listeners.forEach((listener) => listener());
}
