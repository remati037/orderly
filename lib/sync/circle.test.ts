import { describe, it, expect } from "vitest";
import { phoneFromCircleMember } from "./circle";

describe("phoneFromCircleMember", () => {
  it("reads the phone from a custom profile field", () => {
    expect(
      phoneFromCircleMember({ flattened_profile_fields: { bio: "", telefon: " +381601234567 " } })
    ).toBe("+381601234567");
  });

  it("returns null when the field is missing or empty", () => {
    expect(phoneFromCircleMember({ flattened_profile_fields: { telefon: "" } })).toBeNull();
    expect(phoneFromCircleMember({ flattened_profile_fields: { bio: "x" } })).toBeNull();
    expect(phoneFromCircleMember(null)).toBeNull();
  });
});
