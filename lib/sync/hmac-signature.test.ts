import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSignature } from "./hmac-signature";

const body = '{"id":123,"status":"completed"}';
const secret = "cs_test_secret";
const b64 = crypto.createHmac("sha256", secret).update(body).digest("base64");
const hex = crypto.createHmac("sha256", secret).update(body).digest("hex");

describe("verifyHmacSignature", () => {
  it("accepts a valid WooCommerce (base64) signature", () => {
    expect(verifyHmacSignature(body, b64, secret, "base64")).toBe(true);
  });

  it("accepts a valid Thinkific (hex) signature", () => {
    expect(verifyHmacSignature(body, hex, secret, "hex")).toBe(true);
  });

  it("rejects a missing header — never skips verification", () => {
    expect(verifyHmacSignature(body, null, secret, "base64")).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    expect(verifyHmacSignature(body, b64, null, "base64")).toBe(false);
    expect(verifyHmacSignature(body, b64, "", "base64")).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifyHmacSignature(body.replace("123", "124"), b64, secret, "base64")).toBe(false);
  });

  it("rejects a signature of a different length without throwing", () => {
    expect(verifyHmacSignature(body, "abc", secret, "base64")).toBe(false);
  });

  it("rejects the right digest in the wrong encoding", () => {
    expect(verifyHmacSignature(body, hex, secret, "base64")).toBe(false);
  });
});
