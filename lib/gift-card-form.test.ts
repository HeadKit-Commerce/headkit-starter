import { describe, expect, it } from "vitest";

import {
  giftCardSchema,
  isGiftCardFormat,
  INVALID_CODE_MESSAGE,
} from "@/lib/gift-card-form";

/**
 * Gift-card code contract + unified-input discriminator (GIFT-03 / 09-10).
 *
 * The unified "Coupon Code or Gift Card" box (coupon-box.tsx) discriminates on
 * `isGiftCardFormat`: a 4-4-4-4 code routes to the gift-card apply path, any
 * other code routes to the coupon apply path. When a non-gift-format code is
 * rejected by the coupon endpoint (neither a valid coupon nor a gift card), the
 * box shows `INVALID_CODE_MESSAGE`. These pure functions are unit-tested in the
 * app's node vitest environment (no jsdom/testing-library), mirroring the
 * lib/address-form.ts precedent; the component imports the same primitives.
 */
describe("giftCardSchema", () => {
  it("accepts a valid 19-char 4-4-4-4 code", () => {
    const result = giftCardSchema.safeParse({ code: "TEST-GIFT-CARD-0001" });
    expect(result.success).toBe(true);
  });

  it("accepts a mixed alphanumeric 4-4-4-4 code", () => {
    const result = giftCardSchema.safeParse({ code: "A1B2-C3D4-E5F6-G7H8" });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    const result = giftCardSchema.safeParse({
      code: "  TEST-GIFT-CARD-0001  ",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a too-short code", () => {
    const result = giftCardSchema.safeParse({ code: "TEST-GIFT-0001" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Enter a valid gift card code",
      );
    }
  });

  it("rejects a code with wrong group lengths", () => {
    expect(
      giftCardSchema.safeParse({ code: "TESTT-GIFT-CARD-001" }).success,
    ).toBe(false);
  });

  it("rejects a code without hyphen separators", () => {
    expect(
      giftCardSchema.safeParse({ code: "TESTGIFTCARD0001XXX" }).success,
    ).toBe(false);
  });

  it("rejects a code with disallowed characters", () => {
    expect(
      giftCardSchema.safeParse({ code: "TEST-GIFT-CARD-00_1" }).success,
    ).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(giftCardSchema.safeParse({ code: "" }).success).toBe(false);
  });
});

describe("isGiftCardFormat (unified-box discriminator)", () => {
  it("routes a 4-4-4-4 code to the gift-card path (true)", () => {
    expect(isGiftCardFormat("TEST-GIFT-CARD-0001")).toBe(true);
    expect(isGiftCardFormat("A1B2-C3D4-E5F6-G7H8")).toBe(true);
  });

  it("trims surrounding whitespace so it never misroutes", () => {
    expect(isGiftCardFormat("  TEST-GIFT-CARD-0001  ")).toBe(true);
  });

  it("routes a freeform coupon code to the coupon path (false)", () => {
    expect(isGiftCardFormat("SUMMER25")).toBe(false);
    expect(isGiftCardFormat("save10")).toBe(false);
  });

  it("routes a code that is neither format to the coupon path (false)", () => {
    // A malformed code (wrong group lengths / stray chars) is not gift-format,
    // so it falls to the coupon endpoint, which rejects it → combined message.
    expect(isGiftCardFormat("TEST-GIFT-0001")).toBe(false);
    expect(isGiftCardFormat("TEST-GIFT-CARD-00_1")).toBe(false);
  });
});

describe("INVALID_CODE_MESSAGE (combined error)", () => {
  it("is the combined coupon-or-gift-card rejection message", () => {
    expect(INVALID_CODE_MESSAGE).toBe(
      "That code isn't a valid coupon or gift card.",
    );
  });
});
