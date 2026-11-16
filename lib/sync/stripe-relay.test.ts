import { describe, expect, it } from "vitest";
import { needsProductCheck, parseRelayConfig } from "./stripe-relay";

describe("parseRelayConfig", () => {
  const value = {
    "100knjiga": { target: "https://100knjiga.example.com/api/stripe-webhook", site_id: "s1", products: ["prod_A"] },
    bad: { target: "http://insecure.example.com", site_id: "s1", products: ["prod_A"] },
    empty: { target: "https://x.example.com", site_id: "s1", products: [] },
  };
  it("returns the relay by id", () => {
    expect(parseRelayConfig(value, "100knjiga")).toEqual({
      target: "https://100knjiga.example.com/api/stripe-webhook",
      site_id: "s1",
      products: ["prod_A"],
    });
  });
  it("rejects unknown, non-https and product-less relays", () => {
    expect(parseRelayConfig(value, "nope")).toBeNull();
    expect(parseRelayConfig(value, "bad")).toBeNull();
    expect(parseRelayConfig(value, "empty")).toBeNull();
    expect(parseRelayConfig(null, "100knjiga")).toBeNull();
  });
});

describe("needsProductCheck", () => {
  it("checks only Checkout Session events", () => {
    expect(needsProductCheck("checkout.session.completed")).toBe(true);
    expect(needsProductCheck("checkout.session.async_payment_succeeded")).toBe(true);
    expect(needsProductCheck("charge.succeeded")).toBe(false);
  });
});
