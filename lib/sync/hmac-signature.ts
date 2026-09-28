import crypto from "crypto";

// Verifies a plain HMAC-SHA256 webhook signature over the raw request body.
//   WooCommerce: X-WC-Webhook-Signature, base64, keyed with the webhook secret.
//   Thinkific:   X-Thinkific-Hmac-Sha256, hex, keyed with the API key.
// Missing header or secret always fails — never skip verification.
export function verifyHmacSignature(
  rawBody: string,
  header: string | null,
  secret: string | null | undefined,
  encoding: "base64" | "hex"
): boolean {
  if (!header || !secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest(encoding);

  const a = Buffer.from(header.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
