// Columns of `sites` that are safe to send to the browser. The API credential
// columns (consumer_key / consumer_secret / thinkific_api_key — for Stripe
// sites the secret key and webhook signing secret) never leave the server;
// the client only learns whether each one is set.
export const PUBLIC_SITE_COLUMNS =
  "id, name, platform, url, subdomain, color_hex, is_active, project_type, default_margin_percent, stripe_filter, created_at";

const SECRET_COLUMNS = ["consumer_key", "consumer_secret", "thinkific_api_key"] as const;

type SecretFlags = { has_consumer_key: boolean; has_consumer_secret: boolean; has_thinkific_api_key: boolean };

export function secretFlags(row: Partial<Record<(typeof SECRET_COLUMNS)[number], string | null>>): SecretFlags {
  return {
    has_consumer_key: !!row.consumer_key,
    has_consumer_secret: !!row.consumer_secret,
    has_thinkific_api_key: !!row.thinkific_api_key,
  };
}

const EDITABLE_COLUMNS = [
  "name", "platform", "url", "subdomain", "color_hex", "is_active",
  "project_type", "default_margin_percent", "stripe_filter",
] as const;

// Whitelists a PATCH body. Secret fields are only written when a new non-empty
// value is sent — an empty field in the edit form means "keep the stored one".
export function siteUpdateFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const col of EDITABLE_COLUMNS) if (col in body) update[col] = body[col];
  for (const col of SECRET_COLUMNS) {
    const v = body[col];
    if (typeof v === "string" && v.trim()) update[col] = v.trim();
  }
  return update;
}
