import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * **With no offline gateway on the cart, this checkout is what it was.**
 *
 * The guard that protects every store whose shoppers only ever pay by card —
 * which is most of them — and the one this whole change is gated on. It says
 * plainly what it covers and where it stops, per the bar in AGENTS.md.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT COVERS — the chain, not one link
 * ---------------------------------------------------------------------------
 * The property can break in three independent places, and a test of any ONE of
 * them passes while the other two are broken:
 *
 *   1. `hasOfflineGatewayOption` says yes for a cart that has no such gateway.
 *      Covered by driving the REAL predicate over the carts `app/checkout/
 *      page.tsx` feeds it — including the two that must be refused even on a
 *      store that HAS one (hosted checkout, and the offline-ONLY cart, which
 *      has its own page and must not be dragged into the Stripe steps).
 *   2. `resolveOfflineGatewayOptions` invents a gateway. Covered by driving the
 *      REAL resolver with the env absent, present, and malformed.
 *   3. `CheckoutSteps` renders something when the prop is absent. Covered by
 *      rendering the REAL component tree with `useOfflinePaymentOption`
 *      MOCKED TO THROW whenever it is called with a non-empty `gateways`
 *      array: the hook is called UNCONDITIONALLY now (`CheckoutSteps` calls
 *      it every render, gating internally on `gateways.length`, not by
 *      skipping the call), so the probe that matters is what it is called
 *      WITH. If the disabled path ever passes a real gateway through, the
 *      render fails. Byte-equality against the enabled render then shows the
 *      difference is exactly the offline rows and nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHERE IT STOPS — read this before trusting it further
 * ---------------------------------------------------------------------------
 * - It renders CheckoutSteps with Stripe's Elements modules stubbed, so it
 *   says nothing about the STRIPE markup being unchanged — only that no
 *   offline markup, module or side effect is introduced. Stripe's own subtree
 *   is opaque to it.
 * - It is a server render. Effects never run and nothing is clicked, so it
 *   says nothing about placing an order (`lib/offline-order.test.ts`) or about
 *   which action button appears
 *   (`components/checkout/steps/payment-step-single-action.test.tsx`).
 * - It covers the CHECKOUT page only. The offline-ONLY checkout
 *   (`components/checkout/offline-payment-checkout.test.tsx`) is a different
 *   component with its own suite, and is deliberately untouched by this work.
 */

const hoisted = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return hoisted.env;
  },
}));

// Stripe's Checkout Elements are network-bound and irrelevant to this claim:
// stub them to render children so the surrounding tree is REAL. A RESOLVED
// session, deliberately — the Payment step renders its method rows only once
// `useCheckout()` succeeds, and a "loading" stub would disarm the probe below.
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useCheckout: () => ({
    type: "success",
    checkout: {
      total: { total: { amount: "A$121.00" } },
      confirm: async () => ({ type: "success" }),
    },
  }),
  PaymentElement: () => <div data-stub="payment-element" />,
  BillingAddressElement: () => <div data-stub="billing-address-element" />,
  ShippingAddressElement: () => <div data-stub="shipping-address-element" />,
  CurrencySelectorElement: () => <div data-stub="currency-selector" />,
  ContactDetailsElement: () => <div data-stub="contact-details" />,
  ExpressCheckoutElement: () => <div data-stub="express-checkout" />,
}));
vi.mock("@/lib/stripe-js-singleton", () => ({
  getStripePromise: () => Promise.resolve({}),
}));
vi.mock("@/components/headkit-ui/cart-context", () => ({
  useCartContext: () => ({
    cartData: {
      needsShipping: true,
      currency: { code: "AUD", symbol: "$", minorUnit: 2 },
      totals: { totalPrice: "121" },
      shippingRates: [],
      items: [],
    },
    setCartData: vi.fn(),
    toggleCart: vi.fn(),
  }),
}));
vi.mock("@/lib/cart-actions", () => ({
  getFullCartAction: async () => null,
  selectShippingAction: vi.fn(),
  clearCartTokenAction: vi.fn(),
}));
vi.mock("@/lib/email-marketing-actions", () => ({
  getEmailMarketingStatusAction: async () => ({ enabled: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// "use server" modules reach `@headkit/sdk/server`, which vitest cannot resolve
// under Node 25 (the SDK ships extensionless ESM imports — AGENTS.md).
vi.mock("@headkit/sdk/debug", () => ({ useDebugRegister: () => undefined }));
vi.mock("@/lib/checkout-session-status", () => ({
  isCheckoutSessionDead: async () => false,
}));
vi.mock("@/app/checkout/actions", () => ({
  createCheckoutSessionAction: vi.fn(),
  getCheckoutAction: vi.fn(),
  expireCheckoutSessionAction: vi.fn(),
  updateCustomerAction: vi.fn(),
  processCheckoutAction: vi.fn(),
  processCheckoutOrderAction: vi.fn(),
}));
vi.mock("@/app/checkout/offline-order-actions", () => ({
  placeOfflineOrderAction: vi.fn(),
}));

// THE probe. `useOfflinePaymentOption` is called on every render (hooks
// cannot be called conditionally), so "never constructed" is no longer
// observable by mocking the call itself. What IS observable, and is the
// actual property under test, is what `CheckoutSteps` passes it: if the
// disabled path ever calls the hook with a non-empty `gateways` array, this
// throws and the test fails. That is a much stronger claim than "the output
// contains no bank-transfer text".
vi.mock("@/components/checkout/steps/offline-payment-option", () => ({
  useOfflinePaymentOption: ({ gateways }: { gateways: unknown[] }) => {
    if (gateways.length > 0) {
      throw new Error(
        "useOfflinePaymentOption was called with a real gateway while none is configured",
      );
    }
    return { rows: null, action: null };
  },
}));

const { CheckoutSteps } = await import("@/app/checkout/CheckoutForm");
const { hasOfflineGatewayOption } = await import("@/lib/payment-gateways");
const { resolveOfflineGatewayOptions, resetOfflineGatewayDetailsCache } =
  await import("@/lib/offline-gateway-details");
const { CheckoutFormStepEnum } = await import("@/components/checkout/utils");

const SESSION_ID = "cs_test_a1b2c3d4e5";

type Gateways = Parameters<typeof CheckoutSteps>[0]["offlineGateways"];

/**
 * Renders the ACCORDION, not `CheckoutForm` — `CheckoutForm` resolves Stripe.js
 * in an effect and a server render runs none, so it returns its skeleton and
 * never mounts a step. Same reason `paypal-absent.test.tsx` renders here.
 */
function render(offlineGateways?: Gateways) {
  return renderToStaticMarkup(
    <CheckoutSteps
      sessionId={SESSION_ID}
      {...(offlineGateways ? { offlineGateways } : {})}
    />,
  );
}

/** Force the accordion to the Payment step, where the offline rows live. */
function renderAtPayment(offlineGateways?: Gateways) {
  return renderToStaticMarkup(
    <CheckoutSteps
      sessionId={SESSION_ID}
      initialStep={CheckoutFormStepEnum.PAYMENT}
      {...(offlineGateways ? { offlineGateways } : {})}
    />,
  );
}

const ENABLED: Gateways = [
  { id: "bacs", title: "Pay by bank", description: "Transfer to 12-3456." },
];

describe("link 1 — the page's own predicate", () => {
  const wooCart = {
    paymentMethods: ["headkit-payments", "bacs"],
    checkoutUrl: null,
    totals: { totalPrice: "121" },
  };

  it("is true for a WooCommerce cart offering card AND an offline gateway", () => {
    expect(hasOfflineGatewayOption(wooCart)).toBe(true);
  });

  it("is false for a card-only cart", () => {
    expect(
      hasOfflineGatewayOption({
        ...wooCart,
        paymentMethods: ["headkit-payments"],
      }),
    ).toBe(false);
  });

  it("never counts the quote gateway as an offline one", () => {
    // Quote mode has its own /quote route and store setting; a quote row at
    // the Payment step would place an order nobody priced.
    expect(
      hasOfflineGatewayOption({
        ...wooCart,
        paymentMethods: ["headkit-payments", "headkit-quote"],
      }),
    ).toBe(false);
  });

  it("refuses the offline-ONLY cart, which has its own page", () => {
    // No `headkit-payments`, so there is no Stripe session and no walked
    // Contact / Delivery steps to reuse: `OfflinePaymentCheckout` owns it.
    expect(
      hasOfflineGatewayOption({ ...wooCart, paymentMethods: ["bacs"] }),
    ).toBe(false);
  });

  it("refuses a hosted-checkout (Shopify) cart", () => {
    expect(
      hasOfflineGatewayOption({
        ...wooCart,
        checkoutUrl: "https://shop.myshopify.com/cart/c/abc",
      }),
    ).toBe(false);
  });

  it("is false for no cart at all", () => {
    expect(hasOfflineGatewayOption(null)).toBe(false);
    expect(hasOfflineGatewayOption(undefined)).toBe(false);
  });
});

describe("link 2 — the resolver invents nothing", () => {
  it("returns NOTHING for a card-only cart, however configured", () => {
    hoisted.env = {
      OFFLINE_PAYMENT_GATEWAY_DETAILS: '{"bacs":{"title":"Pay by bank"}}',
    };
    resetOfflineGatewayDetailsCache();
    expect(resolveOfflineGatewayOptions(["headkit-payments"])).toEqual([]);
    expect(resolveOfflineGatewayOptions([])).toEqual([]);
    expect(resolveOfflineGatewayOptions(null)).toEqual([]);
  });

  it("still offers the gateway with the env absent — core label, no copy", () => {
    // The honest degradation: the row is real (the cart offers it), but the
    // store never told us what to tell the shopper.
    hoisted.env = {};
    resetOfflineGatewayDetailsCache();
    expect(resolveOfflineGatewayOptions(["headkit-payments", "bacs"])).toEqual([
      { id: "bacs", title: "Direct bank transfer", description: "" },
    ]);
  });
});

describe("link 3 — the rendered checkout", () => {
  it("IS called with a real gateway once the prop arrives — so this file's probe is live", () => {
    // FIRST, because everything below is worthless without it: if the mocked
    // hook never sees a real gateway, "no offline markup" is true of a build
    // that renders the rows on every store.
    expect(() => renderAtPayment(ENABLED)).toThrowError(
      /useOfflinePaymentOption was called with a real gateway/,
    );
  });

  it("never passes a real gateway to the hook when the prop is absent", () => {
    expect(() => renderAtPayment()).not.toThrow();
  });

  it("treats an EMPTY array as absent — it is what page.tsx computes", () => {
    expect(() => renderAtPayment([])).not.toThrow();
    expect(renderAtPayment([])).toBe(renderAtPayment());
  });

  it("renders byte-for-byte the same markup with the prop absent as omitted", () => {
    expect(renderAtPayment()).toBe(renderAtPayment(undefined));
    expect(render()).toBe(render(undefined));
  });

  it("carries no offline-attributable markup at any step", () => {
    for (const markup of [render(), renderAtPayment()]) {
      expect(markup).not.toContain("headkit-offline-option");
      expect(markup).not.toContain("headkit-offline-instructions");
      expect(markup).not.toContain("Place order");
    }
  });
});
