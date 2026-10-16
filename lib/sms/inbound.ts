// Maps the gateway's inbound payload to an sms_inbox row. The gateway sends an
// ISO date with offset; anything unparsable falls back to "now" rather than
// losing the message.
export type InboundRow = { external_id: string | null; from_number: string; body: string; received_at: string };

export function inboundRow(
  input: { id?: unknown; from?: unknown; text?: unknown; date?: unknown },
  now = new Date()
): InboundRow | null {
  if (!input.from || typeof input.text !== "string") return null;
  const received = typeof input.date === "string" ? new Date(input.date) : now;
  return {
    external_id: input.id != null ? `gw-${input.id}` : null,
    from_number: String(input.from),
    body: input.text,
    received_at: (isNaN(received.getTime()) ? now : received).toISOString(),
  };
}
