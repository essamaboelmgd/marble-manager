import { describe, expect, it } from "vitest";
import { isActivationCodeValid } from "../src/domain/activation";

describe("offline activation code", () => {
  it("accepts the configured code exactly", () => {
    expect(isActivationCodeValid("ShiFt_2026#")).toBe(true);
  });

  it("rejects an incorrect code", () => {
    expect(isActivationCodeValid("ShiFt_2026")).toBe(false);
  });
});
