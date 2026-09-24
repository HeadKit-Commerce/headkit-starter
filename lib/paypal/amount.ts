/**
 * The ONE place a PayPal amount is derived from a cart.
 *
 * ---------------------------------------------------------------------------
 * The rule, and why it is not the obvious one
 * ---------------------------------------------------------------------------
 * **Derive the parts from the total, never the total from the parts.**
 *
 * `totals.totalPrice` is the same single number the Stripe path charges, and
 * it already carries tax. Every other figure here exists only because PayPal
 * renders a breakdown, and PayPal REJECTS an order whose breakdown does not
 * sum to `amount.value` to the cent. So the total is authoritative and the
 * breakdown is reconciled ONTO it (see `residual` below) — the inverse, which
 * is what v1's `create-order/route.ts:109-137` did, makes PayPal's arithmetic
 * check the thing that decides the charge.
 *
 * ---------------------------------------------------------------------------
 * Two facts about these strings that are easy to get wrong
 * ---------------------------------------------------------------------------
 * 1. **Every `CartTotals` field except `totalPrice` is tax-EXCLUSIVE, with the
 *    tax in a sibling `*_tax` field** — regardless of the store's "display
 *    prices including tax" setting. `lib/cart-prices.ts` is the authority and
 *    carries the full explanation. So `item_total` is
 *    `totalItems + totalItemsTax`, UNCONDITIONALLY. v1 branched on
 *    `displayPricesIncludeTax`; adding that branch back under-quotes
 *    PayPal by the whole tax on any store with prices entered inclusive.
 *    That class of bug is invisible on a zero-tax store, which is how it ships
 *    — `amount.test.ts` carries a 10%-GST fixture for exactly this reason.
 *
 * 2. **`totalPrice` is already a MAJOR-unit decimal string** ("110", "110.00"),
 *    not minor units — commerce divides by `currency_minor_unit` before the
 *    GraphQL layer (the storefront reads it with `getFloatVal` and hands the
 *    result straight to `formatPrice` everywhere). `currency.minorUnit` is
 *    therefore how many DECIMAL PLACES PayPal's `value` string must carry
 *    (2 for AUD, 0 for JPY), not a divisor. A hardcoded `.toFixed(2)` is a
 *    ×100 error on a 0-decimal currency.
 *
 * All arithmetic below runs in integer minor units so repeated float addition
 * cannot drift a cent into PayPal's equality check.
 */

import { getFloatVal } from "@/lib/utils";

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

/**
 * PayPal's `purchase_units[0].amount.breakdown`. `handling` is present only
 * as the reconciliation term described below; we never charge handling.
 */
export interface PayPalAmountBreakdown {
  item_total: PayPalMoney;
  shipping: PayPalMoney;
  tax_total?: PayPalMoney;
  discount?: PayPalMoney;
  handling?: PayPalMoney;
}

export interface PayPalAmount {
  currency_code: string;
  value: string;
  breakdown: PayPalAmountBreakdown;
}

/** The cart fields this module reads. Deliberately structural, not the SDK
 * fragment, so a test fixture is a plain object and a future field addition
 * to `CartFieldsFragment` cannot silently change what the charge is built
 * from. */
export interface PayPalAmountCart {
  currency: { code: string; minorUnit: number };
  totals: {
    totalPrice: string;
    totalItems: string;
    totalItemsTax: string;
    totalShipping: string;
    totalShippingTax: string;
    totalDiscount: string;
    totalDiscountTax: string;
  };
}

/** Round a major-unit number to whole minor units (half-up on the .5 cent). */
export function toMinorUnits(major: number, minorUnit: number): number {
  return Math.round(major * 10 ** minorUnit);
}

/**
 * Format whole minor units as the major-unit decimal string PayPal expects,
 * with exactly `minorUnit` decimal places. Never `toFixed(2)`: JPY takes
 * `"1000"`, and PayPal rejects `"1000.00"` for a 0-decimal currency.
 */
export function fromMinorUnits(minor: number, minorUnit: number): string {
  const negative = minor < 0;
  const digits = Math.abs(Math.round(minor))
    .toString()
    .padStart(minorUnit + 1, "0");
  const whole =
    minorUnit === 0 ? digits : digits.slice(0, digits.length - minorUnit);
  const fraction =
    minorUnit === 0 ? "" : `.${digits.slice(digits.length - minorUnit)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** A total plus its sibling tax, in minor units. See fact (1) above. */
function withTax(total: string, tax: string, minorUnit: number): number {
  return toMinorUnits(getFloatVal(total) + getFloatVal(tax), minorUnit);
}

/** The authoritative charge for this cart, in minor units. */
export function cartTotalMinorUnits(cart: PayPalAmountCart): number {
  return toMinorUnits(
    getFloatVal(cart.totals.totalPrice),
    cart.currency.minorUnit,
  );
}

/**
 * Build `purchase_units[0].amount` for this cart.
 *
 * `value` is `totalPrice` and nothing else. The breakdown is then made to sum
 * to it exactly: whatever the tax-inclusive item / shipping / discount parts
 * do not account for — per-unit rounding, an applied gift card, any future
 * total the cart grows that this module does not know about — lands in ONE
 * reconciliation term, so the order is always internally consistent and the
 * unexplained remainder is visible rather than silently changing the charge.
 *
 * NO `items[]` array, deliberately (v1 did the same). Itemising re-introduces
 * per-line rounding that would then have to be reconciled a second time, and
 * unlike the Stripe path there is no `reconcileCheckoutChargeTotal` to lean on.
 */
export function payPalAmountFromCart(cart: PayPalAmountCart): PayPalAmount {
  const { minorUnit, code } = cart.currency;
  const money = (minor: number): PayPalMoney => ({
    currency_code: code,
    value: fromMinorUnits(minor, minorUnit),
  });

  const totalMinor = cartTotalMinorUnits(cart);
  const itemsMinor = withTax(
    cart.totals.totalItems,
    cart.totals.totalItemsTax,
    minorUnit,
  );
  const shippingMinor = withTax(
    cart.totals.totalShipping,
    cart.totals.totalShippingTax,
    minorUnit,
  );
  let discountMinor = withTax(
    cart.totals.totalDiscount,
    cart.totals.totalDiscountTax,
    minorUnit,
  );

  // item_total + shipping - discount must equal value. Anything left over is
  // money the parts do not explain.
  const residual = totalMinor - (itemsMinor + shippingMinor - discountMinor);

  let handlingMinor = 0;
  if (residual < 0) {
    // The parts over-quote — the cart carries a reduction these three fields
    // do not name (a gift card is the live example). Deepen the discount.
    discountMinor += -residual;
  } else if (residual > 0) {
    // The parts under-quote. `handling` is PayPal's only additive slot that
    // is not a tax or a shipping charge, so a positive remainder goes there
    // rather than being folded into item_total, where it would misstate the
    // value of the goods.
    handlingMinor = residual;
  }

  const breakdown: PayPalAmountBreakdown = {
    // item_total is REQUIRED whenever a breakdown is sent, even at zero.
    item_total: money(itemsMinor),
    shipping: money(shippingMinor),
    ...(discountMinor > 0 ? { discount: money(discountMinor) } : {}),
    ...(handlingMinor > 0 ? { handling: money(handlingMinor) } : {}),
  };

  return {
    currency_code: code,
    value: fromMinorUnits(totalMinor, minorUnit),
    breakdown,
  };
}

/**
 * Sum a breakdown the way PayPal does, in minor units. Exported so the test
 * can assert the invariant rather than restate the arithmetic.
 */
export function breakdownSumMinorUnits(
  breakdown: PayPalAmountBreakdown,
  minorUnit: number,
): number {
  const part = (money: PayPalMoney | undefined): number =>
    money ? toMinorUnits(getFloatVal(money.value), minorUnit) : 0;
  return (
    part(breakdown.item_total) +
    part(breakdown.shipping) +
    part(breakdown.tax_total) +
    part(breakdown.handling) -
    part(breakdown.discount)
  );
}

/**
 * The capture guard's tolerance: ONE minor unit (v1's hardcoded 1 cent,
 * generalised so a 0-decimal currency does not get a 100× slacker guard).
 *
 * Anything larger than this between what PayPal captured and what a FRESH
 * server-side cart read says is owed is treated as tampering, not rounding.
 */
export function amountsWithinTolerance(
  capturedMinor: number,
  expectedMinor: number,
): boolean {
  return Math.abs(capturedMinor - expectedMinor) <= 1;
}
