import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyStripeSignature } from "./stripe-signature";

const secret = "whsec_test";
const body = '{"id":"evt_1"}';
const sign = (t: number, payload = body) =>
  crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");

afterEach(() => vi.useRealTimers());

describe("verifyStripeSignature", () => {
  it("accepts a fresh, correctly signed payload", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(t)}`, secret)).toBe(true);
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${sign(t)}`, secret)).toBe(true);
  });

  it("rejects replays outside the tolerance window", () => {
    const t = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(t)}`, secret)).toBe(false);
  });

  it("rejects a tampered body, missing header or missing secret", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature('{"id":"evt_2"}', `t=${t},v1=${sign(t)}`, secret)).toBe(false);
    expect(verifyStripeSignature(body, null, secret)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(t)}`, "")).toBe(false);
  });
});
