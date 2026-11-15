// Fixed one-minute window per caller, in memory. The routes it guards must stay
// read-only (no counter table), so the limit holds per server instance: Vercel
// reuses warm instances, which is enough to stop a runaway client. The real
// guard against abuse is the token.

export const SUPPORT_RATE_LIMIT = 120; // requests per minute per token
const WINDOW_MS = 60_000;

const windows = new Map<string, { start: number; count: number }>();

export interface RateResult {
  ok: boolean;
  retryAfter: number; // seconds until the window resets
}

export function takeRateLimit(key: string, now = Date.now(), limit = SUPPORT_RATE_LIMIT): RateResult {
  let w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 };
    windows.set(key, w);
    if (windows.size > 1000) {
      for (const [k, v] of windows) if (now - v.start >= WINDOW_MS) windows.delete(k);
    }
  }
  w.count += 1;
  return { ok: w.count <= limit, retryAfter: Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000)) };
}

/** Tests only. */
export function resetRateLimits() {
  windows.clear();
}
