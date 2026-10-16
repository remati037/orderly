import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { tokenMatches } from "./gateway-auth";

const hash = (s: string) => createHash("sha256").update(s).digest();

describe("tokenMatches", () => {
  it("accepts the right bearer token", () => {
    expect(tokenMatches("Bearer s3cret", hash("s3cret"))).toBe(true);
  });
  it("rejects a wrong, empty or missing token", () => {
    expect(tokenMatches("Bearer nope", hash("s3cret"))).toBe(false);
    expect(tokenMatches("Bearer ", hash("s3cret"))).toBe(false);
    expect(tokenMatches(null, hash("s3cret"))).toBe(false);
  });
});
