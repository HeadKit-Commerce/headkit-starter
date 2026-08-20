/**
 * Tax-inclusive display totals for the storefront.
 *
 * ---------------------------------------------------------------------------
 * KNOWN LIMITATION — these helpers assume `woocommerce_prices_include_tax = yes`
 * ---------------------------------------------------------------------------
 * The addition below is UNCONDITIONAL for every non-hosted-checkout cart. That
 * is correct on a store whose prices are entered INCLUSIVE of tax (the AU/EU
 * posture, the posture of `docker/wordpress/seed-tax.php`, and the posture of
 * every live HeadKit customer), and it is inert on a zero-tax store because the
 * added term is 0.
 *
 * On a store whose prices are entered EXCLUSIVE of tax (the common US posture)
 * these helpers OVER-QUOTE by the tax rate, inverting the defect they close.
 * The reason is that the PDP renders `$product->get_price()` — the RAW stored
 * price (`integrations/wordpress/theme/inc/rest-api/headkit-products.php:705`,
 * `:978`, `:1567`) — and that figure follows `woocommerce_prices_include_tax`,
 * not `woocommerce_tax_display_*`. So on an ex-tax-pricing store the PDP shows
 * $100 while these helpers render $108.25, where the pre-fix code rendered $100
 * and matched.
 *
 * This is not fixable here: the Store API does not publish
 * `woocommerce_prices_include_tax` on the cart, so honouring it requires
 * commerce to surface the setting. Tracked as follow-up
 * **260820-tax-display-configurable-per-store**
 * (`docs/tickets/tax-display-configurable-per-store.md`). Until then the unconditional
 * behaviour ships deliberately — the tax-inclusive defect is live and
 * customer-visible, the ex-tax-pricing tenant is hypothetical.
 *
 * ---------------------------------------------------------------------------
 * KNOWN LIMITATION 2 — the sale strikethrough follows a DIFFERENT setting
 * ---------------------------------------------------------------------------
 * `cart-item.tsx:218-228` renders the struck-through regular price from the
 * per-item `prices` object, which the Store API DOES compute according to
 * `woocommerce_tax_display_cart`. The line total beside it comes from the
 * totals, which never follow that setting. On a `tax_display_cart = excl`
 * store the two bases diverge and the struck-through figure can render BELOW
 * the price it is struck against (regular A$120 / sale A$110 at 10% GST
 * renders A$109.09 struck above A$110.00).
 *
 * Inert on `tax_display_cart = incl`, which the fixture and every current
 * store use. `prices` carries no sibling `*_tax`, so there is no honest local
 * fix; it folds into the same follow-up,
 * **260820-tax-display-configurable-per-store**
 * (`docs/tickets/tax-display-configurable-per-store.md`).
 */

import { hasHostedCheckout } from "@/lib/hosted-checkout";
import { getFloatVal } from "@/lib/utils";

/**
 * The money figures a shopper-facing line total is derived from.
 *
 * Deliberately all-optional and all-nullable: the cart path
 * (`CartFieldsFragment["items"][number]["totals"]`) guarantees every field, but
 * the two order pages read an order whose `totals` is itself optional, and both
 * already carried a `?? lineTotal ?? prices.price` fallback chain. A single
 * permissive shape lets one helper serve both without either call site
 * re-deriving the chain.
 */
export interface LineTotalsLike {
  lineSubtotal?: string | null;
  lineSubtotalTax?: string | null;
  lineTotal?: string | null;
  lineTotalTax?: string | null;
}

/** The cart-level totals the drawer footer and the summary rows read. */
export interface CartTotalsLike {
  totalItems?: string | null;
  totalItemsTax?: string | null;
  totalDiscount?: string | null;
  totalDiscountTax?: string | null;
  totalShipping?: string | null;
  totalShippingTax?: string | null;
}

/**
 * A cart or an order, as these helpers need it: the totals themselves, plus the
 * one field that says which tax convention those totals follow.
 *
 * `checkoutUrl` is the discriminator the repo already documents — see
 * {@link hasHostedCheckout}. An order carries no `checkoutUrl` and is therefore
 * read as WooCommerce, which is correct: HeadKit only ever renders its own
 * order pages for the provider whose checkout it owns.
 */
export interface DisplayTotalsSource {
  checkoutUrl?: string | null;
  totals?: CartTotalsLike | null;
}

/**
 * **Every WooCommerce Store API TOTAL is tax-EXCLUSIVE, with the tax split into
 * a sibling `*_tax` field.** That is true of the totals regardless of the
 * store's "display prices including tax" setting, which governs WooCommerce's
 * own templates. (The per-item `prices` object is a different matter: the Store
 * API does compute that one according to the setting, via
 * `wc_get_price_including_tax` / `wc_get_price_excluding_tax`.) A headless
 * client that wants the inclusive figure from a TOTAL must add the sibling back
 * itself.
 *
 * This module is the one place that addition happens.
 *
 * **Why it exists as a module and not four inline `+` operators.** The defect it
 * closes shipped in the repo's first commit and stayed invisible for months:
 * the demo store and the e2e fixture both had zero tax, so `line_subtotal ==
 * line_subtotal + line_subtotal_tax` and every wrong read returned a right
 * number. It surfaced only when a live customer enabled 10% GST, at which point
 * the cart line, the cart footer, the checkout summary line and both order
 * pages each quoted ~9.1% under the price advertised on the PDP. The correct
 * pattern already existed one file away (the mobile checkout toggle in
 * `checkout-page-content.tsx`) and had simply never been applied to the other
 * five sites — which is exactly what a shared helper prevents from recurring.
 *
 * **The addition is WooCommerce's convention, not a universal one.** A
 * hosted-checkout provider reports its own totals its own way: Shopify maps
 * `TotalItems` from `cost.subtotalAmount` and `TotalItemsTax` from
 * `cost.totalTaxAmount`, and on a tax-inclusive market (AU/EU) the subtotal
 * ALREADY carries the tax the sibling reports — so adding them would overstate
 * the bag by the GST. Every helper here therefore gates the addition on
 * {@link hasHostedCheckout}.
 *
 * At line level that gate looks redundant today, and deliberately so: the
 * Shopify cart mapper emits `zeroMoney` for `LineSubtotalTax` / `LineTotalTax`,
 * so the added term is already 0 there. One rule applied everywhere is safer
 * than two, and it stops a later mapping change from silently reopening this.
 *
 * `source` is REQUIRED, not optional. An omitted argument would default to the
 * WooCommerce answer and silently re-add the tax on a hosted-checkout cart —
 * exactly the double-count the gate exists to prevent — so a new line-level
 * call site has to state which cart it is reading and gets a compile error
 * instead. Pass `null` only where there is genuinely no cart in scope.
 *
 * @see {@link cartItemsDisplayTotal} for the cart-level equivalent.
 * @see {@link orderItemsDisplayTotal} for the order-page roll-up.
 */
export function lineDisplayTotal(
  totals: LineTotalsLike | null | undefined,
  fallbackPrice: string | null | undefined,
  source: DisplayTotalsSource | null,
): number {
  const inclusive = hasHostedCheckout(source);
  // Each branch pairs a total with ITS OWN sibling tax. Reading `lineTotal` but
  // adding `lineSubtotalTax` would be a new bug of the same family: on a
  // discounted line the two differ.
  if (totals?.lineSubtotal != null) {
    return withSiblingTax(
      totals.lineSubtotal,
      totals.lineSubtotalTax,
      inclusive,
    );
  }
  if (totals?.lineTotal != null) {
    return withSiblingTax(totals.lineTotal, totals.lineTotalTax, inclusive);
  }
  // `prices.price` is the unit price the provider advertises, not a Store API
  // total, so it takes no addition — but note it is inclusive only on a store
  // configured to display prices including tax. It is also the last resort,
  // reached only when an order response carries no line totals at all.
  return getFloatVal(fallbackPrice);
}

/**
 * The tax-inclusive value of everything in a CART, before shipping and before
 * discounts.
 *
 * Read by the cart drawer footer, which carries no tax row of its own, and by
 * the checkout summary's "Subtotal" row — both of which sit above a "Total"
 * that already reads the inclusive `totalPrice`, so an ex-tax figure there
 * would not reconcile with the tax-inclusive line rows above it.
 *
 * **Cart only.** An ORDER's `totals.totalItemsTax` is not a real figure: wc/v3
 * orders carry no `total_items_tax`, so commerce hard-codes it to `"0"` and
 * sums `totalItems` from `line_items[].subtotal`, which is ex-tax. Adding a
 * zero sibling to an ex-tax total yields an ex-tax total. Order pages must use
 * {@link orderItemsDisplayTotal}, which reads the per-line sibling taxes the
 * order path DOES populate.
 *
 * @see {@link lineDisplayTotal} for the per-line equivalent and the full
 * explanation of why the addition is needed and why it is gated.
 */
export function cartItemsDisplayTotal(
  source: DisplayTotalsSource | null | undefined,
): number {
  return withSiblingTax(
    source?.totals?.totalItems,
    source?.totals?.totalItemsTax,
    hasHostedCheckout(source),
  );
}

/**
 * The tax-inclusive discount for a CART, so a "Discount" row subtracts on the
 * same basis the "Subtotal" row above it is quoted on.
 *
 * Cart only, for the same reason as {@link cartItemsDisplayTotal}: an order's
 * `totalDiscountTax` is hard-coded `"0"`. Order pages use
 * {@link orderDiscountDisplayTotal}.
 *
 * @see {@link cartItemsDisplayTotal}.
 */
export function cartDiscountDisplayTotal(
  source: DisplayTotalsSource | null | undefined,
): number {
  return withSiblingTax(
    source?.totals?.totalDiscount,
    source?.totals?.totalDiscountTax,
    hasHostedCheckout(source),
  );
}

/**
 * The tax-inclusive shipping figure, for the "Shipping" row on the checkout
 * summary and both order pages.
 *
 * **Works for a cart AND an order, unlike its items/discount siblings.**
 * `totalShippingTax` is the one cart-level sibling tax the order path really
 * populates — commerce maps it straight off the wc/v3 order's `shipping_tax`,
 * where it hard-codes `totalItemsTax` and `totalDiscountTax` to `"0"`. So no
 * line-summing variant is needed here.
 *
 * @see {@link cartItemsDisplayTotal}.
 */
export function shippingDisplayTotal(
  source: DisplayTotalsSource | null | undefined,
): number {
  return withSiblingTax(
    source?.totals?.totalShipping,
    source?.totals?.totalShippingTax,
    hasHostedCheckout(source),
  );
}

/** One applied coupon, as the checkout summary's coupon chip needs it. */
export interface CouponTotalsLike {
  totalDiscount?: string | null;
  totalDiscountTax?: string | null;
}

/**
 * ONE coupon's tax-inclusive discount, so the per-coupon chip is quoted on the
 * same basis as the aggregate "Discount" row directly beneath it. With a single
 * coupon applied the two figures are then the same number, which is what a
 * shopper expects to see.
 *
 * `coupon.totalDiscount` is a Store API total like any other — tax-exclusive
 * with the tax in `total_discount_tax` — so it takes the same addition and the
 * same gate. The gate is inert on a hosted-checkout cart because the Shopify
 * mapper emits `zeroMoney` for a coupon's `TotalDiscountTax`, exactly as it
 * does at line level; it is kept so there is one rule rather than three.
 *
 * @see {@link cartDiscountDisplayTotal} for the cart-wide aggregate.
 */
export function couponDiscountDisplayTotal(
  coupon: CouponTotalsLike | null | undefined,
  source: DisplayTotalsSource | null,
): number {
  return withSiblingTax(
    coupon?.totalDiscount,
    coupon?.totalDiscountTax,
    hasHostedCheckout(source),
  );
}

/** One placed-order line, as the order-page roll-ups need it. */
export interface OrderLineLike {
  totals?: LineTotalsLike | null;
  prices?: { price?: string | null } | null;
}

/**
 * An ORDER's tax-inclusive items subtotal, summed from its own line rows.
 *
 * The order path publishes real per-line sibling taxes (`LineSubtotalTax` /
 * `LineTotalTax` are mapped straight off the wc/v3 line item) while its
 * cart-level roll-up does not, so the only honest inclusive subtotal available
 * to a client is the sum of the lines. Summing exactly what
 * {@link lineDisplayTotal} renders also guarantees the Subtotal row equals the
 * line rows printed above it, which is the property the page's arithmetic
 * depends on.
 */
export function orderItemsDisplayTotal(
  items: readonly OrderLineLike[] | null | undefined,
  source: DisplayTotalsSource | null,
): number {
  return (items ?? []).reduce(
    (sum, item) =>
      sum + lineDisplayTotal(item.totals, item.prices?.price, source),
    0,
  );
}

/**
 * An ORDER's tax-inclusive discount: what the lines cost before the discount
 * minus what they cost after it.
 *
 * WooCommerce records both sides per line — `subtotal`/`subtotal_tax` are
 * pre-discount and `total`/`total_tax` are post-discount — so the difference is
 * `discount_total + discount_tax`, the inclusive figure the order's own
 * `totalDiscountTax` cannot supply because commerce hard-codes it to `"0"`.
 * Lines missing either side contribute nothing rather than a half-derived
 * number.
 */
export function orderDiscountDisplayTotal(
  items: readonly OrderLineLike[] | null | undefined,
  source: DisplayTotalsSource | null,
): number {
  const inclusive = hasHostedCheckout(source);
  return (items ?? []).reduce((sum, item) => {
    const totals = item.totals;
    if (totals?.lineSubtotal == null || totals.lineTotal == null) {
      return sum;
    }
    return (
      sum +
      withSiblingTax(totals.lineSubtotal, totals.lineSubtotalTax, inclusive) -
      withSiblingTax(totals.lineTotal, totals.lineTotalTax, inclusive)
    );
  }, 0);
}

function withSiblingTax(
  total: string | null | undefined,
  tax: string | null | undefined,
  totalAlreadyIncludesTax: boolean,
): number {
  return totalAlreadyIncludesTax
    ? getFloatVal(total)
    : getFloatVal(total) + getFloatVal(tax);
}
