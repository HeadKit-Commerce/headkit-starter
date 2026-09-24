import { describe, expect, it } from "vitest";
import {
  amountsWithinTolerance,
  breakdownSumMinorUnits,
  cartTotalMinorUnits,
  fromMinorUnits,
  payPalAmountFromCart,
  toMinorUnits,
  type PayPalAmountCart,
} from "@/lib/paypal/amount";

/**
 * The money math, against the two things that make it go wrong silently.
 *
 * **Tax.** `docker/wordpress/seed-tax.php` is the repo's 10%-GST fixture and
 * exists because this class of bug is INVISIBLE on a zero-tax store — every
 * wrong read returns a right number when the sibling tax is 0. So the first
 * fixture here is a taxed one, and the assertion is that PayPal is quoted
 * `totals.totalPrice` exactly: the same number the Stripe path charges and the
 * same one the checkout summary shows.
 *
 * **Scale.** `totalPrice` is a MAJOR-unit string, and `currency.minorUnit` is
 * the number of decimal places PayPal's `value` must carry — not a divisor.
 * A 0-decimal currency (JPY) is what separates a correct implementation from
 * one that hardcodes `.toFixed(2)`, so it gets its own case.
 *
 * What is NOT asserted here: that PayPal accepts these payloads. No PayPal API
 * is called anywhere in this suite.
 */

/** A 10% GST cart: A$100 ex-GST of goods, A$10 ex-GST shipping, both taxed. */
function gstCart(
  over: Partial<PayPalAmountCart["totals"]> = {},
): PayPalAmountCart {
  return {
    currency: { code: "AUD", minorUnit: 2 },
    totals: {
      totalItems: "100",
      totalItemsTax: "10",
      totalShipping: "10",
      totalShippingTax: "1",
      totalDiscount: "0",
      totalDiscountTax: "0",
      totalPrice: "121",
      ...over,
    },
  };
}

describe("toMinorUnits / fromMinorUnits", () => {
  it("round-trips a 2-decimal currency", () => {
    expect(fromMinorUnits(toMinorUnits(121, 2), 2)).toBe("121.00");
    expect(fromMinorUnits(toMinorUnits(0.05, 2), 2)).toBe("0.05");
    expect(fromMinorUnits(toMinorUnits(1234.5, 2), 2)).toBe("1234.50");
  });

  it("emits NO decimal point for a 0-decimal currency", () => {
    // The whole point: `.toFixed(2)` here would send "1000.00" for ¥1000 and
    // PayPal rejects it.
    expect(fromMinorUnits(toMinorUnits(1000, 0), 0)).toBe("1000");
  });

  it("pads a value smaller than one major unit", () => {
    expect(fromMinorUnits(5, 2)).toBe("0.05");
    expect(fromMinorUnits(0, 2)).toBe("0.00");
  });
});

describe("payPalAmountFromCart on a tax-inclusive (10% GST) store", () => {
  const cart = gstCart();
  const amount = payPalAmountFromCart(cart);

  it("quotes PayPal exactly totals.totalPrice", () => {
    // The defect this closes: v1 branched on `displayPricesIncludeTax` and,
    // on a prices-include-tax store, quoted the ex-GST figure — under-charging
    // by the whole GST.
    expect(amount.value).toBe("121.00");
    expect(amount.value).toBe(
      fromMinorUnits(cartTotalMinorUnits(cart), cart.currency.minorUnit),
    );
  });

  it("names the cart's currency", () => {
    expect(amount.currency_code).toBe("AUD");
  });

  it("adds each sibling tax to its own total, unconditionally", () => {
    expect(amount.breakdown.item_total.value).toBe("110.00");
    expect(amount.breakdown.shipping.value).toBe("11.00");
  });

  it("sends a breakdown that sums to value — PayPal's hard constraint", () => {
    expect(breakdownSumMinorUnits(amount.breakdown, 2)).toBe(
      cartTotalMinorUnits(cart),
    );
  });

  it("sends no items[] array", () => {
    expect(amount).not.toHaveProperty("items");
  });
});

describe("payPalAmountFromCart reconciles the breakdown ONTO the total", () => {
  it("carries a tax-inclusive coupon discount", () => {
    const cart = gstCart({
      totalDiscount: "10",
      totalDiscountTax: "1",
      totalPrice: "110",
    });
    const amount = payPalAmountFromCart(cart);
    expect(amount.value).toBe("110.00");
    expect(amount.breakdown.discount?.value).toBe("11.00");
    expect(breakdownSumMinorUnits(amount.breakdown, 2)).toBe(11000);
  });

  it("absorbs a reduction the three totals do not name, as extra discount", () => {
    // A gift card is the live example: it lowers `totalPrice` without
    // appearing in `totalDiscount`. Deriving the total from the parts would
    // OVER-charge by the card's value; deriving the parts from the total
    // cannot.
    const cart = gstCart({ totalPrice: "71" }); // A$50 gift card applied
    const amount = payPalAmountFromCart(cart);
    expect(amount.value).toBe("71.00");
    expect(amount.breakdown.discount?.value).toBe("50.00");
    expect(breakdownSumMinorUnits(amount.breakdown, 2)).toBe(7100);
  });

  it("absorbs an unexplained INCREASE as handling rather than misstating goods", () => {
    const cart = gstCart({ totalPrice: "126" });
    const amount = payPalAmountFromCart(cart);
    expect(amount.value).toBe("126.00");
    expect(amount.breakdown.handling?.value).toBe("5.00");
    // item_total still says what the goods are worth.
    expect(amount.breakdown.item_total.value).toBe("110.00");
    expect(breakdownSumMinorUnits(amount.breakdown, 2)).toBe(12600);
  });

  it("omits discount and handling when the parts already reconcile", () => {
    const amount = payPalAmountFromCart(gstCart());
    expect(amount.breakdown.discount).toBeUndefined();
    expect(amount.breakdown.handling).toBeUndefined();
  });
});

describe("payPalAmountFromCart on a 0-decimal currency", () => {
  const cart: PayPalAmountCart = {
    currency: { code: "JPY", minorUnit: 0 },
    totals: {
      totalItems: "5000",
      totalItemsTax: "0",
      totalShipping: "500",
      totalShippingTax: "0",
      totalDiscount: "0",
      totalDiscountTax: "0",
      totalPrice: "5500",
    },
  };

  it("scales by minorUnit, not by a hardcoded 100", () => {
    const amount = payPalAmountFromCart(cart);
    expect(amount.value).toBe("5500");
    expect(amount.breakdown.item_total.value).toBe("5000");
    expect(amount.breakdown.shipping.value).toBe("500");
  });

  it("still sums exactly", () => {
    const amount = payPalAmountFromCart(cart);
    expect(breakdownSumMinorUnits(amount.breakdown, 0)).toBe(5500);
  });
});

describe("amountsWithinTolerance", () => {
  it("allows one minor unit of rounding either way", () => {
    expect(amountsWithinTolerance(12100, 12100)).toBe(true);
    expect(amountsWithinTolerance(12101, 12100)).toBe(true);
    expect(amountsWithinTolerance(12099, 12100)).toBe(true);
  });

  it("rejects two minor units — that is drift, not rounding", () => {
    expect(amountsWithinTolerance(12102, 12100)).toBe(false);
    expect(amountsWithinTolerance(1, 12100)).toBe(false);
  });
});
