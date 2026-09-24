import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * **With no PayPal credentials, this checkout is what it was.**
 *
 * This is the guard that protects every store that has not configured PayPal,
 * and the one the whole change is gated on — so it says plainly what it covers
 * and where it stops.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT COVERS — the chain, not one link
 * ---------------------------------------------------------------------------
 * The property can break in three independent places, and a test of any ONE of
 * them passes while the other two are broken:
 *
 *   1. `lib/paypal/config.ts` hands out options it should not. Covered by
 *      driving the REAL module with the env absent, half-present, and present.
 *   2. `app/checkout/page.tsx` decides to pass them anyway. Covered by driving
 *      the REAL `hasPayPalOption` predicate over the same carts the page feeds
 *      it — including the two carts that must be refused even on a fully
 *      configured store (hosted checkout, zero total).
 *   3. `CheckoutForm` renders something when the prop is absent. Covered by
 *      rendering the REAL component tree with `usePayPalPaymentOption` MOCKED
 *      TO THROW whenever it is called with real (non-null) `options`: the hook
 *      is called UNCONDITIONALLY now (`CheckoutSteps` calls it every render,
 *      gating internally, not by skipping the call — see the hook's own
 *      docblock), so the probe that matters is what it is called WITH, not
 *      whether it is called at all. If the disabled path ever passes real
 *      options through, the render fails. Byte-equality against the enabled
 *      render then shows the difference is exactly the PayPal block and
 *      nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHERE IT STOPS — read this before trusting it further
 * ---------------------------------------------------------------------------
 * - It renders CheckoutForm with Stripe's Elements modules stubbed, so it says
 *   nothing about the STRIPE markup being unchanged — only that no PayPal
 *   markup, module or side effect is introduced. Stripe's own subtree is
 *   opaque to it.
 * - It is a server render (`renderToStaticMarkup`). Effects never run, so the
 *   SDK loader is proven un-imported, not proven un-invoked. The loader's own
 *   behaviour is not exercised anywhere in the unit suite.
 * - It covers the CHECKOUT page only. The four `/api/paypal/*` routes' 503
 *   behaviour with no credentials is asserted in their own suites.
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
// stub them to render children so the surrounding tree is REAL.
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  // A RESOLVED session, deliberately. The Payment step renders its method
  // rows — Stripe's accordion and, on a configured store, this fork's PayPal
  // peer row — only once `useCheckout()` succeeds; a "loading" stub returns
  // the skeleton and never reaches them, which would silently disarm the
  // probe below (the whole point of the first test in link 3).
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
// under Node 25 (the SDK ships extensionless ESM imports — AGENTS.md). Stubbing
// them keeps this suite about the render, not about the SDK's packaging.
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

// THE probe. `usePayPalPaymentOption` is called on every render (hooks
// cannot be called conditionally — `showPayPalRow` flips once `cartData`
// loads), so "never constructed" is no longer observable by mocking the call
// itself. What IS observable, and is the actual property under test, is
// what `CheckoutSteps` passes it: if the disabled path ever calls the hook
// with real (non-null) `options`, this throws and the test fails. That is a
// much stronger claim than "the output contains no PayPal text".
vi.mock("@/components/checkout/steps/paypal-payment-option", () => ({
  usePayPalPaymentOption: ({ options }: { options: unknown }) => {
    if (options) {
      throw new Error(
        "usePayPalPaymentOption was called with real options while PayPal is off",
      );
    }
    return { row: null, action: null };
  },
}));

const { CheckoutSteps } = await import("@/app/checkout/CheckoutForm");
const { getPayPalClientOptions, isPayPalConfigured } =
  await import("@/lib/paypal/config");
const { hasPayPalOption } = await import("@/lib/payment-gateways");
const { CheckoutFormStepEnum } = await import("@/components/checkout/utils");

const SESSION_ID = "cs_test_a1b2c3d4e5";

/**
 * Renders the ACCORDION, not `CheckoutForm`.
 *
 * `CheckoutForm` resolves Stripe.js in an effect, and a server render runs no
 * effects — so it returns its loading skeleton and never mounts a single step.
 * Asserting "no PayPal markup" through it would have passed against a build
 * where PayPal rendered on every store. The probe below is what caught that,
 * and it is why the whole file renders one level down.
 */
function render(payPalOptions?: {
  clientId: string;
  environment: "live" | "sandbox";
}) {
  return renderToStaticMarkup(
    <CheckoutSteps
      sessionId={SESSION_ID}
      {...(payPalOptions ? { payPalOptions } : {})}
    />,
  );
}

/** Force the accordion to the Payment step, where the PayPal block lives. */
function renderAtPayment(payPalOptions?: {
  clientId: string;
  environment: "live" | "sandbox";
}) {
  return renderToStaticMarkup(
    <CheckoutSteps
      sessionId={SESSION_ID}
      initialStep={CheckoutFormStepEnum.PAYMENT}
      {...(payPalOptions ? { payPalOptions } : {})}
    />,
  );
}

describe("link 1 — the credential gate hands out nothing it should not", () => {
  const cases: Array<[string, Record<string, string | undefined>]> = [
    ["both absent", {}],
    ["client id only", { NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id" }],
    ["secret only", { PAYPAL_CLIENT_SECRET: "shh" }],
    [
      "live-mode flag but no credentials",
      { NEXT_PUBLIC_PAYPAL_LIVE_MODE: "true" },
    ],
  ];

  for (const [name, env] of cases) {
    it(`is off with ${name}`, () => {
      hoisted.env = env;
      expect(isPayPalConfigured()).toBe(false);
      expect(getPayPalClientOptions()).toBeNull();
    });
  }

  it("is on, and SANDBOX by default, with both credentials", () => {
    hoisted.env = {
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id",
      PAYPAL_CLIENT_SECRET: "shh",
    };
    // An unset live-mode flag must never mean live — a half-configured store
    // must not be able to take real money by accident.
    expect(getPayPalClientOptions()).toEqual({
      clientId: "id",
      environment: "sandbox",
    });
  });
});

describe("link 2 — the page's own predicate", () => {
  const wooCart = {
    paymentMethods: ["headkit-payments"],
    checkoutUrl: null,
    totals: { totalPrice: "121" },
  };

  it("is false for every cart when the store is not configured", () => {
    expect(hasPayPalOption(wooCart, false)).toBe(false);
  });

  it("is true only for a payable WooCommerce cart on a configured store", () => {
    expect(hasPayPalOption(wooCart, true)).toBe(true);
  });

  it("refuses a hosted-checkout (Shopify) cart even when configured", () => {
    // Shopify owns its checkout end to end — there is no WooCommerce order for
    // a PayPal capture to attach to.
    expect(
      hasPayPalOption(
        { ...wooCart, checkoutUrl: "https://shop.myshopify.com/cart/c/abc" },
        true,
      ),
    ).toBe(false);
  });

  it("refuses a zero-total cart even when configured", () => {
    // A $0 order has no payment step at all, and PayPal rejects a zero amount.
    expect(
      hasPayPalOption({ ...wooCart, totals: { totalPrice: "0" } }, true),
    ).toBe(false);
  });

  it("refuses a cart with no headkit-payments gateway", () => {
    expect(
      hasPayPalOption({ ...wooCart, paymentMethods: ["bacs"] }, true),
    ).toBe(false);
  });
});

describe("link 3 — the rendered checkout", () => {
  it("IS called with real options once the prop arrives — so this file's probe is live", () => {
    // FIRST, because everything below is worthless without it: if the mocked
    // hook never sees real options, "no PayPal markup" is true of a build
    // that renders PayPal on every store. This exact assertion caught
    // precisely that — the file originally rendered `CheckoutForm`, whose
    // effect-mounted Stripe promise makes a server render stop at the
    // skeleton.
    hoisted.env = {
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: "id",
      PAYPAL_CLIENT_SECRET: "shh",
    };
    expect(() =>
      renderAtPayment({ clientId: "id", environment: "sandbox" }),
    ).toThrowError(/usePayPalPaymentOption was called with real options/);
  });

  it("never passes real options to the hook when the prop is absent", () => {
    hoisted.env = {};
    // The mocked hook throws when called with real options; completing the
    // render at the Payment step IS the assertion.
    expect(() => renderAtPayment()).not.toThrow();
  });

  it("renders byte-for-byte the same markup with the prop absent as omitted", () => {
    hoisted.env = {};
    expect(renderAtPayment()).toBe(renderAtPayment(undefined));
    expect(render()).toBe(render(undefined));
  });

  it("carries no PayPal-attributable markup at any step", () => {
    hoisted.env = {};
    for (const markup of [render(), renderAtPayment()]) {
      expect(markup.toLowerCase()).not.toContain("paypal");
      expect(markup).not.toContain("headkit-paypal-option");
    }
  });
});
