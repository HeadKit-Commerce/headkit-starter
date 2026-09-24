import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * **Exactly one primary action button, always AFTER every row.**
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COVERS
 * ---------------------------------------------------------------------------
 * The MARKUP half of the rule, for all THREE selections, through the REAL
 * `StripePaymentStep`, `usePayPalPaymentOption` and `useOfflinePaymentOption`,
 * composed the way `app/checkout/CheckoutForm.tsx` composes them (Stripe step
 * + both of this store's ROWS passed as `alternativeMethodRows`, the selected
 * method's ACTION passed as `externalAction`):
 *
 *   - a Stripe method selected → the `Pay {amount}` button is present and
 *     neither the PayPal buttons host nor a `Place order` button exists;
 *   - PayPal selected          → the PayPal buttons host, and no `Pay` and no
 *     `Place order` button anywhere;
 *   - an offline gateway selected → a `Place order` button carrying the SAME
 *     amount, its instructions, and no `Pay` button and no PayPal buttons;
 *   - in every state all three ROWS are present, because they are peers of
 *     Stripe's rows rather than blocks that appear on selection;
 *   - in every state the one present action is the LAST thing in the markup
 *     — after the PayPal row AND after the offline row, never between them
 *     (the bug this file's `describe("the action is always last")` block
 *     exists to catch: a test that only checked "exactly one" passed with
 *     PayPal's buttons sitting between the PayPal and offline rows).
 *
 * ---------------------------------------------------------------------------
 * WHERE IT STOPS — read this before trusting it further
 * ---------------------------------------------------------------------------
 * - It is a SERVER render (`vitest.config.ts` is `environment: "node"`). No
 *   effect runs, so it proves nothing about `paymentElement.collapse()`, about
 *   PayPal's SDK, or about the `isEligible()` probe. The PayPal buttons host
 *   is asserted as an empty container — the iframe that fills it is never
 *   created here.
 * - It cannot click. The transitions between these three states are the
 *   reducer's, and they are exercised in `lib/payment-method-selection.test.ts`.
 *   Nor does it place an order: `placeOfflineOrderAction` is stubbed, and what
 *   that action actually does is `lib/offline-order.test.ts`.
 * - Stripe's own accordion is a stub. Whether exactly one row LOOKS selected
 *   across the iframe boundary is not observable from any test in this repo;
 *   the PR's screenshots are the evidence for that half, and for the real
 *   PayPal iframe actually landing below the offline row in the browser.
 * - `app/checkout/paypal-absent.test.tsx` and
 *   `app/checkout/offline-gateway-absent.test.tsx` are what hold the
 *   store-without-PayPal and cart-without-an-offline-gateway cases; nothing
 *   here says anything about either.
 */

const hoisted = vi.hoisted(() => ({
  payAmount: "A$121.00",
}));

vi.mock("@stripe/react-stripe-js/checkout", () => ({
  useCheckout: () => ({
    type: "success",
    checkout: {
      total: { total: { amount: hoisted.payAmount } },
      confirm: vi.fn(),
    },
  }),
  PaymentElement: () => <div data-stub="payment-element" />,
  BillingAddressElement: () => <div data-stub="billing-address-element" />,
  CurrencySelectorElement: () => <div data-stub="currency-selector" />,
}));
vi.mock("@/app/checkout/checkout-actions-context", () => ({
  useCheckoutActions: () => ({ actions: null }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/headkit-ui/cart-context", () => ({
  useCartContext: () => ({ setCartData: vi.fn(), toggleCart: vi.fn() }),
}));
vi.mock("@/lib/cart-actions", () => ({ clearCartTokenAction: vi.fn() }));
// A "use server" module, so it reaches `@headkit/sdk/server`, which vitest
// cannot resolve under Node 25 (AGENTS.md). Nothing here ever calls it.
vi.mock("@/app/checkout/offline-order-actions", () => ({
  placeOfflineOrderAction: vi.fn(),
}));
// Reaches `@headkit/sdk/server`, which vitest cannot resolve under Node 25
// (the SDK ships extensionless ESM imports — AGENTS.md).
vi.mock("@/lib/checkout-session-status", () => ({
  isCheckoutSessionDead: async () => false,
}));

const { StripePaymentStep } =
  await import("@/components/checkout/steps/stripe-checkout-step");
const { usePayPalPaymentOption } =
  await import("@/components/checkout/steps/paypal-payment-option");
const { useOfflinePaymentOption } =
  await import("@/components/checkout/steps/offline-payment-option");

const PAYPAL_OPTIONS = { clientId: "id", environment: "sandbox" as const };

/** As the server resolves them — a re-titled `bacs` with its instructions. */
const OFFLINE_GATEWAYS = [
  {
    id: "bacs",
    title: "Pay by bank",
    description: "Pay by bank transfer to 12-3456.\nOrders ship once cleared.",
  },
];

type Selection = "stripe" | "paypal" | "offline";

/**
 * The composition `CheckoutForm` renders, at one selection of the three: the
 * two hooks called once (never duplicated), their `row`/`rows` placed as
 * peers before any action, and the selected method's `action` passed as the
 * step's ONE `externalAction` slot.
 */
function Harness({ selection }: { selection: Selection }) {
  const paypal = usePayPalPaymentOption({
    options: PAYPAL_OPTIONS,
    currency: "AUD",
    selected: selection === "paypal",
    onSelect: () => {},
  });
  const offline = useOfflinePaymentOption({
    gateways: OFFLINE_GATEWAYS,
    selectedGatewayId: selection === "offline" ? "bacs" : null,
    onSelect: () => {},
  });
  return (
    <StripePaymentStep
      sessionId="cs_test_a1b2c3"
      externalMethodSelected={selection !== "stripe"}
      onStripeMethodSelected={() => {}}
      alternativeMethodRows={
        <div role="radiogroup" aria-label="Other payment methods">
          {paypal.row}
          {offline.rows}
        </div>
      }
      externalAction={paypal.action ?? offline.action}
    />
  );
}

function renderStep(selection: Selection): string {
  return renderToStaticMarkup(<Harness selection={selection} />);
}

/** Stripe's pay button is the only `<button>` in the step that carries a price. */
function hasStripePayButton(markup: string): boolean {
  return markup.includes(`Pay ${hoisted.payAmount}`);
}

/** The host PayPal's iframe renders into; present only while PayPal is chosen. */
function hasPayPalButtonsHost(markup: string): boolean {
  return markup.includes("headkit-paypal-buttons");
}

/** The offline action; present only while an offline gateway is chosen. */
function hasPlaceOrderButton(markup: string): boolean {
  return markup.includes("Place order");
}

/** Index of the marker in the markup, or -1 if absent — for position asserts. */
function indexOf(markup: string, marker: string): number {
  return markup.indexOf(marker);
}

describe("the Payment step renders exactly one primary action", () => {
  it("Stripe selected: the Pay button, and neither of ours", () => {
    const markup = renderStep("stripe");
    expect(hasStripePayButton(markup)).toBe(true);
    expect(hasPayPalButtonsHost(markup)).toBe(false);
    expect(hasPlaceOrderButton(markup)).toBe(false);
  });

  it("PayPal selected: the PayPal buttons host, and NO other action", () => {
    const markup = renderStep("paypal");
    expect(hasPayPalButtonsHost(markup)).toBe(true);
    expect(hasStripePayButton(markup)).toBe(false);
    expect(hasPlaceOrderButton(markup)).toBe(false);
    // Not just the priced label — no pay affordance of any kind survives.
    expect(markup).not.toContain("Pay Now");
  });

  it("offline selected: Place order, and NO Stripe or PayPal action", () => {
    const markup = renderStep("offline");
    expect(hasPlaceOrderButton(markup)).toBe(true);
    expect(hasStripePayButton(markup)).toBe(false);
    expect(hasPayPalButtonsHost(markup)).toBe(false);
    expect(markup).not.toContain("Pay Now");
  });

  it("prices the offline button from the SAME total Stripe's uses", () => {
    // Two buttons quoting different numbers for one cart is the failure this
    // guards; both read `useCheckout().checkout.total`.
    expect(renderStep("offline")).toContain(`Place order ${hoisted.payAmount}`);
  });

  it("says Place order, never Pay — the order is UNPAID", () => {
    expect(renderStep("offline")).not.toContain(`Pay ${hoisted.payAmount}`);
  });

  it("shows the merchant's instructions only on the SELECTED offline row", () => {
    // Without them the shopper has no account to transfer to, so their
    // presence is part of the action, not decoration.
    expect(renderStep("offline")).toContain("Pay by bank transfer to 12-3456.");
    for (const selection of ["stripe", "paypal"] as const) {
      expect(renderStep(selection)).not.toContain(
        "Pay by bank transfer to 12-3456.",
      );
    }
  });

  it("never renders two, in any of the three states", () => {
    const expected: Record<Selection, [boolean, boolean, boolean]> = {
      stripe: [true, false, false],
      paypal: [false, true, false],
      offline: [false, false, true],
    };
    for (const selection of ["stripe", "paypal", "offline"] as const) {
      const markup = renderStep(selection);
      expect([
        hasStripePayButton(markup),
        hasPayPalButtonsHost(markup),
        hasPlaceOrderButton(markup),
      ]).toEqual(expected[selection]);
    }
  });
});

describe("the action is always last — below every row, never between two", () => {
  it("PayPal selected: the buttons host comes AFTER the offline row, not before it", () => {
    // This is exactly the bug: PayPal's buttons used to render between the
    // PayPal row and the offline row. Asserting "exists" was not enough to
    // catch it — position has to be checked too.
    const markup = renderStep("paypal");
    const offlineRow = indexOf(markup, ">Pay by bank<");
    const actionHost = indexOf(markup, "headkit-paypal-buttons");
    expect(offlineRow).toBeGreaterThan(-1);
    expect(actionHost).toBeGreaterThan(-1);
    expect(actionHost).toBeGreaterThan(offlineRow);
  });

  it("PayPal selected: the buttons host comes AFTER the PayPal row itself", () => {
    const markup = renderStep("paypal");
    const payPalRow = indexOf(markup, ">PayPal<");
    const actionHost = indexOf(markup, "headkit-paypal-buttons");
    expect(actionHost).toBeGreaterThan(payPalRow);
  });

  it("offline selected: Place order comes AFTER the PayPal row", () => {
    const markup = renderStep("offline");
    const payPalRow = indexOf(markup, ">PayPal<");
    const placeOrder = indexOf(markup, "Place order");
    expect(payPalRow).toBeGreaterThan(-1);
    expect(placeOrder).toBeGreaterThan(payPalRow);
  });

  it("offline selected: Place order comes AFTER the offline row and its instructions", () => {
    const markup = renderStep("offline");
    const instructions = indexOf(markup, "Pay by bank transfer to 12-3456.");
    const placeOrder = indexOf(markup, "Place order");
    expect(instructions).toBeGreaterThan(-1);
    expect(placeOrder).toBeGreaterThan(instructions);
  });

  it("Stripe selected: the Pay button comes AFTER both the PayPal and offline rows", () => {
    const markup = renderStep("stripe");
    const payPalRow = indexOf(markup, ">PayPal<");
    const offlineRow = indexOf(markup, ">Pay by bank<");
    const payButton = indexOf(markup, `Pay ${hoisted.payAmount}`);
    expect(payButton).toBeGreaterThan(payPalRow);
    expect(payButton).toBeGreaterThan(offlineRow);
  });

  it("the action sits in its own marked area, in every state", () => {
    for (const selection of ["stripe", "paypal", "offline"] as const) {
      expect(renderStep(selection)).toContain("headkit-payment-action-area");
    }
  });
});

describe("our rows are peers, not bolt-ons", () => {
  it("both are present in EVERY state, in the same row treatment", () => {
    for (const selection of ["stripe", "paypal", "offline"] as const) {
      const markup = renderStep(selection);
      expect(markup).toContain("headkit-payment-method-row");
      expect(markup).toContain("headkit-payment-method-radio");
      // Both of this store's rows, always — the label is what identifies each.
      expect(markup).toContain(">PayPal<");
      expect(markup).toContain(">Pay by bank<");
    }
  });

  it("marks exactly ONE row selected, in each of the three states", () => {
    const selectedCount = (markup: string) =>
      markup.split('aria-checked="true"').length - 1;
    // Stripe's own rows live in an iframe this render never produces, so on
    // "stripe" the honest claim is that NEITHER of ours is marked.
    expect(selectedCount(renderStep("stripe"))).toBe(0);
    expect(selectedCount(renderStep("paypal"))).toBe(1);
    expect(selectedCount(renderStep("offline"))).toBe(1);
  });

  it("drops the OR rule the separate block used to draw", () => {
    // The rule existed only to separate a block from the element above it.
    // A peer row must not reintroduce a divider between the method rows.
    expect(renderStep("stripe")).not.toContain(">or<");
  });

  it("hides the billing element while one of ours owns the step", () => {
    // "Billing same as shipping" belongs to the Stripe confirm, which cannot
    // run while PayPal or an offline gateway is selected.
    const withBilling = renderToStaticMarkup(
      <StripePaymentStep showBillingSameAsShipping shippingAddress={null} />,
    );
    expect(withBilling).toContain("billing-address-element");

    const payPalOwns = renderToStaticMarkup(
      <StripePaymentStep
        showBillingSameAsShipping
        shippingAddress={null}
        externalMethodSelected
      />,
    );
    expect(payPalOwns).not.toContain("billing-address-element");
  });
});
