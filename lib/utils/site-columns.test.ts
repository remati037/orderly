import { describe, expect, it } from "vitest";
import { PUBLIC_SITE_COLUMNS, secretFlags, siteUpdateFromBody } from "./site-columns";

describe("site credential handling", () => {
  it("never lists credential columns as public", () => {
    expect(PUBLIC_SITE_COLUMNS).not.toMatch(/consumer_key|consumer_secret|thinkific_api_key/);
  });

  it("exposes only whether credentials are set", () => {
    expect(secretFlags({ consumer_key: "ck", consumer_secret: null })).toEqual({
      has_consumer_key: true, has_consumer_secret: false, has_thinkific_api_key: false,
    });
  });

  it("whitelists PATCH fields and keeps stored secrets when the field is empty", () => {
    expect(
      siteUpdateFromBody({ name: "X", id: "evil", created_at: "x", consumer_key: "", consumer_secret: null, thinkific_api_key: " k " })
    ).toEqual({ name: "X", thinkific_api_key: "k" });
  });
});
