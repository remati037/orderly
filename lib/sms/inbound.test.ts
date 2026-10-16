import { describe, expect, it } from "vitest";
import { inboundRow } from "./inbound";

const NOW = new Date("2026-10-16T10:00:00Z");

describe("inboundRow", () => {
  it("maps a gateway message", () => {
    expect(inboundRow({ id: "7-1760600000", from: "+381656384599", text: "STOP", date: "2026-10-16T09:59:00+00:00" }, NOW))
      .toEqual({ external_id: "gw-7-1760600000", from_number: "+381656384599", body: "STOP", received_at: "2026-10-16T09:59:00.000Z" });
  });
  it("keeps the message when the date is missing or garbage", () => {
    expect(inboundRow({ from: "x", text: "hi", date: "nope" }, NOW)?.received_at).toBe(NOW.toISOString());
    expect(inboundRow({ from: "x", text: "hi" }, NOW)?.external_id).toBeNull();
  });
  it("rejects payloads without sender or text", () => {
    expect(inboundRow({ text: "hi" })).toBeNull();
    expect(inboundRow({ from: "x" })).toBeNull();
  });
});
