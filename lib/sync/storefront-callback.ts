import crypto from "crypto";

// Tells the storefront that a manual (bank transfer / IPS QR) order was marked paid or
// cancelled on the Naplata board, so the storefront can update its own records (its order
// sheet, the email list tags that stop selling a product the customer already owns).
// Orderly stays the single place where these orders are marked.
//
// Only sites listed in MANUAL_CALLBACK_URLS get a call: a JSON object {siteId: url}, e.g.
//   {"<odgovoriuniverzuma site id>":"https://odgovoriuniverzuma.rs/api/potvrda-uplate"}
// Body: {"id": <woo_order_id as number>, "vreme": <unix seconds>, "status": "completed"|"cancelled"},
// signed like the manual webhook in the other direction: HMAC-SHA256 (base64) of the raw
// body with MANUAL_WEBHOOK_SECRET, in the X-Potpis header.
//
// Never throws. Returns one entry per order it tried, so the caller can tell the owner
// when the storefront did not get the news (the storefront has a manual fallback).

export interface CallbackOrder {
  site_id: string;
  woo_order_id: string | null;
}

export interface CallbackResult {
  order: string;
  ok: boolean;
  error?: string;
}

export function callbackUrls(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.error("[storefront-callback] MANUAL_CALLBACK_URLS is not valid JSON");
    return {};
  }
}

export function signBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

export async function notifyStorefronts(
  orders: CallbackOrder[],
  status: "completed" | "cancelled",
  opts: { urls?: string; secret?: string; fetchFn?: typeof fetch; now?: () => number } = {}
): Promise<CallbackResult[]> {
  const urls = callbackUrls(opts.urls ?? process.env.MANUAL_CALLBACK_URLS);
  const secret = (opts.secret ?? process.env.MANUAL_WEBHOOK_SECRET)?.trim();
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;

  const targets = orders.filter((o) => urls[o.site_id] && o.woo_order_id);
  if (!targets.length) return [];
  if (!secret) {
    return targets.map((o) => ({ order: String(o.woo_order_id), ok: false, error: "MANUAL_WEBHOOK_SECRET is not set" }));
  }

  return Promise.all(
    targets.map(async (o): Promise<CallbackResult> => {
      const order = String(o.woo_order_id);
      const body = JSON.stringify({ id: Number(order), vreme: Math.floor(now() / 1000), status });
      try {
        const r = await fetchFn(urls[o.site_id], {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Potpis": signBody(body, secret) },
          body,
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) return { order, ok: true };
        const text = (await r.text()).slice(0, 200);
        console.error(`[storefront-callback] order ${order}: ${r.status} ${text}`);
        return { order, ok: false, error: `${r.status} ${text}` };
      } catch (err) {
        console.error(`[storefront-callback] order ${order}:`, err);
        return { order, ok: false, error: String(err) };
      }
    })
  );
}
