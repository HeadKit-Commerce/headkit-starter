import { describe, expect, it } from "vitest";

import {
  cartDiscountDisplayTotal,
  cartItemsDisplayTotal,
  couponDiscountDisplayTotal,
  lineDisplayTotal,
  orderDiscountDisplayTotal,
  orderItemsDisplayTotal,
  shippingDisplayTotal,
} from "./cart-prices";
import { getFloatVal } from "./utils";

/**
 * The tax-inclusive display totals.
 *
 * The bug these close was invisible for the repo's whole history because every
 * store the code was exercised against had **zero tax**, which makes the wrong
 * field and the right field the same number. So the cases below are built the
 * other way round: a taxed store FIRST, and the zero-tax store only as the
 * proof that the fix is inert where the old behaviour was accidentally correct.
 *
 * The taxed figures are the ones measured on the Pblr rehearsal store when the
 * defect was reported — `line_subtotal: "1235"`, `line_subtotal_tax: "124"`,
 * against a PDP-advertised A$1,359 — so a regression here reproduces the
 * original customer-visible symptom exactly.
 *
 * The provider cases exist because the addition is WooCommerce's convention and
 * not a universal one: a hosted-checkout cart (Shopify) reports totals that
 * already carry the tax on a tax-inclusive market, so adding the sibling there
 * would overstate the bag by the GST.
 */

/** A WooCommerce cart: no `checkoutUrl`, totals tax-EXCLUSIVE. */
const wooCart = (totals: Record<string, string>) => ({ totals });

/** A Shopify cart: `checkoutUrl` set, totals already tax-INCLUSIVE. */
const shopifyCart = (totals: Record<string, string>) => ({
  checkoutUrl: "https://shop.myshopify.com/cart/c/abc123",
  totals,
});

describe("lineDisplayTotal — a taxed store (the reported defect)", () => {
  it("adds the sibling tax back onto the line subtotal", () => {
    expect(
      lineDisplayTotal(
        { lineSubtotal: "1235", lineSubtotalTax: "124" },
        null,
        null,
      ),
    ).toBe(1359);
  });

  it("returns the ex-tax figure alone if the tax is dropped — the old behaviour", () => {
    // Guards the guard: if this ever equalled 1359 the case above would prove
    // nothing, because the fixture would have no tax to add.
    expect(
      lineDisplayTotal(
        { lineSubtotal: "1235", lineSubtotalTax: "0" },
        null,
        null,
      ),
    ).toBe(1235);
  });
});

describe("lineDisplayTotal — the order pages' fallback chain", () => {
  it("prefers lineSubtotal, and pairs it with lineSubtotalTax", () => {
    expect(
      lineDisplayTotal(
        {
          lineSubtotal: "100",
          lineSubtotalTax: "10",
          lineTotal: "90",
          lineTotalTax: "9",
        },
        null,
        null,
      ),
    ).toBe(110);
  });

  it("falls back to lineTotal paired with lineTotalTax, never the subtotal's tax", () => {
    // A discounted line is where the two diverge: subtotal is pre-discount and
    // carries more tax than the post-discount total. Crossing them would be the
    // same family of bug as the one this module exists to fix.
    expect(
      lineDisplayTotal({ lineTotal: "90", lineTotalTax: "9" }, null, null),
    ).toBe(99);
  });

  it("falls back last to the unit price, which needs no addition", () => {
    // `prices.price` is what the provider advertises, already inclusive on a
    // store that displays prices including tax — it is not a Store API total.
    expect(lineDisplayTotal(undefined, "1359", null)).toBe(1359);
    expect(lineDisplayTotal({}, "1359", null)).toBe(1359);
  });

  it("is zero when nothing at all is available", () => {
    expect(lineDisplayTotal(null, null, null)).toBe(0);
    expect(lineDisplayTotal(undefined, null, null)).toBe(0);
  });
});

describe("lineDisplayTotal — the provider gate", () => {
  const taxed = { lineSubtotal: "100", lineSubtotalTax: "10" };

  it("adds the sibling tax on a WooCommerce cart", () => {
    expect(lineDisplayTotal(taxed, null, wooCart({}))).toBe(110);
  });

  it("leaves a hosted-checkout cart's line total untouched", () => {
    // Inert against today's Shopify mapper, which emits zeroMoney for both line
    // taxes — the gate exists so a later mapping change cannot reopen this.
    expect(lineDisplayTotal(taxed, null, shopifyCart({}))).toBe(100);
  });

  it("treats an explicitly absent source as WooCommerce", () => {
    // `null` is the only way to say "no cart in scope" — the parameter is
    // required, so a hosted-checkout call site cannot reach the WooCommerce
    // answer by simply forgetting to pass one.
    expect(lineDisplayTotal(taxed, null, null)).toBe(110);
  });
});

describe("cartItemsDisplayTotal — the drawer footer and the Subtotal rows", () => {
  it("adds total_items_tax onto total_items for WooCommerce", () => {
    expect(
      cartItemsDisplayTotal(
        wooCart({ totalItems: "1235", totalItemsTax: "124" }),
      ),
    ).toBe(1359);
  });

  it("returns total_items unchanged for a hosted-checkout cart", () => {
    // Shopify maps TotalItems from cost.subtotalAmount and TotalItemsTax from
    // cost.totalTaxAmount; on a tax-inclusive market the subtotal ALREADY
    // carries that tax, so adding it would overstate the bag by the GST.
    expect(
      cartItemsDisplayTotal(
        shopifyCart({ totalItems: "1235", totalItemsTax: "124" }),
      ),
    ).toBe(1235);
  });

  it("survives an absent cart without throwing", () => {
    expect(cartItemsDisplayTotal(undefined)).toBe(0);
    expect(cartItemsDisplayTotal(null)).toBe(0);
    expect(cartItemsDisplayTotal({})).toBe(0);
  });
});

describe("cartDiscountDisplayTotal — the Discount row", () => {
  it("subtracts on the same inclusive basis the Subtotal row is quoted on", () => {
    expect(
      cartDiscountDisplayTotal(
        wooCart({ totalDiscount: "100", totalDiscountTax: "10" }),
      ),
    ).toBe(110);
  });

  it("leaves a hosted-checkout cart's discount untouched", () => {
    expect(
      cartDiscountDisplayTotal(
        shopifyCart({ totalDiscount: "100", totalDiscountTax: "10" }),
      ),
    ).toBe(100);
  });
});

describe("couponDiscountDisplayTotal — the per-coupon chip", () => {
  const coupon = { totalDiscount: "100", totalDiscountTax: "10" };

  it("adds the sibling tax for WooCommerce", () => {
    expect(couponDiscountDisplayTotal(coupon, wooCart({}))).toBe(110);
  });

  it("leaves a hosted-checkout coupon untouched", () => {
    // Inert against today's Shopify mapper, which emits zeroMoney for a
    // coupon's TotalDiscountTax — the gate keeps one rule rather than three.
    expect(couponDiscountDisplayTotal(coupon, shopifyCart({}))).toBe(100);
  });

  it("survives an absent coupon without throwing", () => {
    expect(couponDiscountDisplayTotal(null, null)).toBe(0);
    expect(couponDiscountDisplayTotal({}, null)).toBe(0);
  });
});

describe("a checkout summary with one coupon reconciles", () => {
  // One cart, exactly as the Store API reports it: an A$110-inc-GST line, a 10%
  // coupon, and inc-GST shipping. Every rendered figure below is derived from
  // THIS object — the coupon chip from `coupons[0]`, the Discount row from the
  // cart-level roll-up — so the agreement between them is a claim about the
  // helpers rather than about constants the test invented.
  const cart = {
    totals: {
      totalItems: "100",
      totalItemsTax: "10",
      totalDiscount: "10",
      totalDiscountTax: "1",
      totalShipping: "10",
      totalShippingTax: "1",
      totalPrice: "110",
    },
    coupons: [{ code: "TENOFF", totalDiscount: "10", totalDiscountTax: "1" }],
  };

  const shippingRow =
    getFloatVal(cart.totals.totalShipping) +
    getFloatVal(cart.totals.totalShippingTax);

  it("the coupon chip shows the same number as the Discount row", () => {
    // The defect: an ex-tax chip (A$10.00) sitting directly above an inclusive
    // Discount row (A$11.00) — two numbers for one coupon, adjacent.
    expect(couponDiscountDisplayTotal(cart.coupons[0], cart)).toBe(
      cartDiscountDisplayTotal(cart),
    );
  });

  it("Subtotal − Discount + Shipping equals the rendered Total", () => {
    expect(
      cartItemsDisplayTotal(cart) -
        cartDiscountDisplayTotal(cart) +
        shippingRow,
    ).toBe(getFloatVal(cart.totals.totalPrice));
  });

  it("and the bare ex-tax chip the defect rendered does NOT match the row", () => {
    expect(getFloatVal(cart.coupons[0]?.totalDiscount)).not.toBe(
      cartDiscountDisplayTotal(cart),
    );
  });
});

describe("an order page's breakdown reconciles", () => {
  // One order, exactly as commerce hands it to the page: a 10% GST line with a
  // 10% coupon, inc-GST shipping, and the cart-level sibling taxes commerce
  // hard-codes to "0" on the order path. Every rendered row is derived from
  // THIS object, so the reconciliation below is a claim about the helpers
  // rather than about constants the test invented.
  const order = {
    totals: {
      totalItems: "100",
      totalItemsTax: "0",
      totalDiscount: "10",
      totalDiscountTax: "0",
      totalShipping: "10",
      totalShippingTax: "1",
      totalPrice: "110",
    },
    items: [
      {
        totals: {
          lineSubtotal: "100",
          lineSubtotalTax: "10",
          lineTotal: "90",
          lineTotalTax: "9",
        },
        prices: { price: "110" },
      },
    ],
  };

  const shippingRow =
    getFloatVal(order.totals.totalShipping) +
    getFloatVal(order.totals.totalShippingTax);

  it("Subtotal − Discount + Shipping equals the rendered Total", () => {
    const subtotalRow = orderItemsDisplayTotal(order.items, order);
    const discountRow = orderDiscountDisplayTotal(order.items, order);

    expect(subtotalRow - discountRow + shippingRow).toBe(
      getFloatVal(order.totals.totalPrice),
    );
  });

  it("the Subtotal row equals the line rows printed above it", () => {
    const lineRows = order.items.reduce(
      (sum, item) =>
        sum + lineDisplayTotal(item.totals, item.prices.price, order),
      0,
    );

    expect(orderItemsDisplayTotal(order.items, order)).toBe(lineRows);
  });

  it("the cart-level helper would NOT reconcile here — why the order path needs its own", () => {
    // cartItemsDisplayTotal reads totals.totalItems + totalItemsTax, and the
    // order path's totalItemsTax is hard-coded "0", so it yields the ex-tax
    // 100 and the breakdown lands 10 short of the 110 total. This is the exact
    // defect the order helpers exist to close.
    const wrongSubtotal = cartItemsDisplayTotal(order);
    const wrongDiscount = cartDiscountDisplayTotal(order);

    expect(wrongSubtotal).toBe(100);
    expect(wrongSubtotal - wrongDiscount + shippingRow).not.toBe(
      getFloatVal(order.totals.totalPrice),
    );
  });
});

describe("the order roll-ups read the LINE taxes, not the cart-level ones", () => {
  // The shape the whole order-page fix is about: commerce hard-codes an order's
  // totalItemsTax / totalDiscountTax to "0" (wc/v3 orders carry no such field)
  // while mapping the per-line subtotal_tax / total_tax straight through.
  const items = [
    {
      totals: {
        lineSubtotal: "100",
        lineSubtotalTax: "10",
        lineTotal: "100",
        lineTotalTax: "10",
      },
    },
    {
      totals: {
        lineSubtotal: "50",
        lineSubtotalTax: "5",
        lineTotal: "50",
        lineTotalTax: "5",
      },
    },
  ];

  it("sums the tax-inclusive line subtotals", () => {
    expect(orderItemsDisplayTotal(items, null)).toBe(165);
  });

  it("returns zero for an order with no lines", () => {
    expect(orderItemsDisplayTotal([], null)).toBe(0);
    expect(orderItemsDisplayTotal(null, null)).toBe(0);
    expect(orderDiscountDisplayTotal(undefined, null)).toBe(0);
  });

  it("falls back to the unit price for a line carrying no totals", () => {
    expect(orderItemsDisplayTotal([{ prices: { price: "1359" } }], null)).toBe(
      1359,
    );
  });

  it("derives the inclusive discount from the pre- and post-discount lines", () => {
    // subtotal 100 + 10 tax, total 90 + 9 tax → an 11.00 inclusive discount,
    // which is discount_total 10 + discount_tax 1. Neither figure is reachable
    // from the order's own totalDiscountTax.
    const discounted = [
      {
        totals: {
          lineSubtotal: "100",
          lineSubtotalTax: "10",
          lineTotal: "90",
          lineTotalTax: "9",
        },
      },
    ];

    expect(orderDiscountDisplayTotal(discounted, null)).toBe(11);
  });

  it("reports no discount when nothing was discounted", () => {
    expect(orderDiscountDisplayTotal(items, null)).toBe(0);
  });

  it("skips a line that carries only one side of the comparison", () => {
    expect(
      orderDiscountDisplayTotal(
        [{ totals: { lineSubtotal: "100", lineSubtotalTax: "10" } }],
        null,
      ),
    ).toBe(0);
  });

  it("adds no tax on a hosted-checkout order", () => {
    expect(orderItemsDisplayTotal(items, shopifyCart({}))).toBe(150);
    expect(
      orderDiscountDisplayTotal(
        [
          {
            totals: {
              lineSubtotal: "100",
              lineSubtotalTax: "10",
              lineTotal: "90",
              lineTotalTax: "9",
            },
          },
        ],
        shopifyCart({}),
      ),
    ).toBe(10);
  });
});

describe("both helpers are inert on a zero-tax store", () => {
  // Why every existing fixture and the demo storefront stayed green through the
  // whole life of the defect, and why this fix cannot move them now.
  it("returns the ex-tax figure unchanged when the tax is zero", () => {
    expect(
      lineDisplayTotal(
        { lineSubtotal: "129900", lineSubtotalTax: "0" },
        null,
        null,
      ),
    ).toBe(129900);
    expect(
      cartItemsDisplayTotal(
        wooCart({ totalItems: "129900", totalItemsTax: "0" }),
      ),
    ).toBe(129900);
  });

  it("returns the ex-tax figure unchanged when the tax field is absent", () => {
    expect(lineDisplayTotal({ lineSubtotal: "129900" }, null, null)).toBe(
      129900,
    );
    expect(cartItemsDisplayTotal(wooCart({ totalItems: "129900" }))).toBe(
      129900,
    );
  });
});

describe("shippingDisplayTotal — the Shipping row", () => {
  it("adds total_shipping_tax onto total_shipping for WooCommerce", () => {
    expect(
      shippingDisplayTotal(
        wooCart({ totalShipping: "10", totalShippingTax: "1" }),
      ),
    ).toBe(11);
  });

  it("leaves a hosted-checkout cart's shipping untouched", () => {
    expect(
      shippingDisplayTotal(
        shopifyCart({ totalShipping: "10", totalShippingTax: "1" }),
      ),
    ).toBe(10);
  });

  it("works on an ORDER too, unlike its items and discount siblings", () => {
    // The order path hard-codes totalItemsTax / totalDiscountTax to "0" but
    // maps totalShippingTax straight off the wc/v3 order's shipping_tax, so
    // the cart-level shipping figures are real here and need no line-summing.
    const order = {
      totals: {
        totalItems: "100",
        totalItemsTax: "0",
        totalDiscount: "0",
        totalDiscountTax: "0",
        totalShipping: "10",
        totalShippingTax: "1",
      },
    };

    expect(shippingDisplayTotal(order)).toBe(11);
    expect(cartItemsDisplayTotal(order)).toBe(100);
  });

  it("survives an absent cart or absent totals without throwing", () => {
    expect(shippingDisplayTotal(undefined)).toBe(0);
    expect(shippingDisplayTotal(null)).toBe(0);
    expect(shippingDisplayTotal({})).toBe(0);
  });
});
