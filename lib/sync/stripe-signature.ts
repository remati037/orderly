import crypto from "crypto";

// Verifies a Stripe-Signature header without the stripe SDK.
// Header format:  t=<unix>,v1=<hex>,v1=<hex>,...
// Signed payload: `${t}.${rawBody}`, HMAC-SHA256 with the webhook signing secret.
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  signingSecret: string,
  toleranceSeconds = 300
): boolean {
  if (!header || !signingSecret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  if (!timestamp) return false;

  // Reject replays outside the tolerance window.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  // Stripe may send several v1 signatures; accept if any matches.
  const provided = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));

  return provided.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}
