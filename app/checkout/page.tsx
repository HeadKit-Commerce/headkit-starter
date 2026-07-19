import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateCartStock, autoCorrectCart } from "@/lib/cart-validation";
import { createCheckoutSessionAction } from "./actions";
import { CheckoutPageContent } from "./checkout-page-content";
import type { CartFieldsFragment } from "@headkit/sdk";
import { getFullCartAction } from "@/lib/cart-actions";
import { getCustomer } from "@/lib/account-actions";
import { getAuthToken } from "@/lib/auth-cookie";
import { resolveCheckoutEmail } from "@/lib/checkout-email";
import { getFloatVal } from "@/lib/utils";
import { createServerHeadkit } from "@/lib/sdk.server";
import { PaymentFailedBanner } from "@/components/checkout/payment-failed-banner";
import { CartChangedBanner } from "@/components/checkout/cart-changed-banner";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // ENG-789: the checkout return page redirects failed/canceled payments
  // (e.g. Afterpay declines) back here with ?error=payment_failed for an
  // in-place retry. Reading searchParams keeps the page dynamic — it already
  // is (cookie-based cart fetch).
  const { error } = await searchParams;
  const paymentFailed = error === "payment_failed";
  // ENG-784: BNPL returns whose session was deliberately expired because the
  // cart drifted land here with ?error=cart_changed — cart intact, fresh
  // session minted below, honest banner on top.
  const cartChanged = error === "cart_changed";

  let cart = await getFullCartAction();

  // null  = no cookie, or WooCommerce session expired (stale cookie was cleared)
  // empty = user genuinely has an empty cart
  if (!cart) {
    redirect("/checkout/error?reason=session_expired");
  }
  if (cart.itemsCount === 0) {
    redirect("/checkout/error?reason=empty_cart");
  }

  // Server-side stock validation — auto-correct before showing the page.
  const validation = validateCartStock(cart.items);
  let stockCorrectionMessage: string | null = null;

  if (!validation.isValid) {
    const correction = await autoCorrectCart(validation.issues);
    stockCorrectionMessage = correction.message;

    // Re-fetch the cart after corrections.
    cart = await getFullCartAction();

    if (!cart || cart.itemsCount === 0) {
      redirect("/checkout/error?reason=stock_correction_empty");
    }
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const successBaseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  // CKA-04 prefill + ENG-801: resolve the shopper's email server-side SOLELY
  // to seed the Contact step prefill via the `customerEmail` prop below. The
  // session itself is created email-LESS — Stripe renders a session created
  // with `customer_email` as "prefilled and not editable", which locked the
  // ContactDetailsElement input on reload/recreate. The session receives the
  // email post-create via `actions.updateEmail` (one-shot push effect in
  // CheckoutSteps / contact-step submit), so the field stays editable.
  // A1: the authed Store API cart natively surfaces the WP billing email;
  // `getCustomer(authToken)` is a defensive fallback only when the cart has
  // none. Guest (no cookie / no email) → undefined → no prefill (unchanged).
  // The token/email are never logged (T-04.1-15).
  const authToken = getAuthToken(await cookies());
  // ENG-783: a logged-in shopper (WP auth cookie present) has a server-known
  // identity. CheckoutForm uses this to suppress the provider-level
  // `defaultValues.email` prefill — against a session with a bound email-ful
  // customer the init-time prefill triggers IntegrationError → loaderror on
  // all elements. The ContactDetailsElement itself always mounts; a bound
  // email-ful session displays the fixed email inside it.
  // Auth is the cookie ONLY — never inferred from `customerEmail` (a guest who
  // typed a billing email also has one).
  const isAuthenticated = !!authToken;
  let fallbackEmail: string | undefined;
  if (authToken && !cart.billingAddress?.email?.trim()) {
    const customer = await getCustomer(authToken);
    if (customer.success && customer.data?.email) {
      fallbackEmail = customer.data.email;
    }
  }
  const customerEmail = resolveCheckoutEmail(cart, fallbackEmail);

  let checkoutSession: {
    clientSecret: string;
    sessionId: string;
    publishableKey: string;
    stripeAccountId?: string | null;
    shippingOptionMapping?: Array<{
      rateId: string;
      stripeShippingRateId: string;
    }> | null;
  } | null = null;
  // ENG-838: a settled-free cart ($0 total AND shipping settled — no shipping
  // needed, or a rate already selected) renders the no-payment confirm and
  // must NOT create a checkout session here: on the zero-total path the
  // server-side createCheckoutSession FINALIZES the WC order, so doing it
  // during SSR would place an order at page VIEW (and a reload would try to
  // finalize the consumed cart again → "This order cannot be paid for").
  // The finalize belongs to the Place-order click (placeFreeOrder). Mirrors
  // isZeroTotalCart in commerce and the free-branch condition in
  // checkout-page-content.tsx.
  const zeroTotal = getFloatVal(cart.totals.totalPrice ?? "0") <= 0;
  const shippingSettled =
    !cart.needsShipping ||
    (cart.shippingRates ?? []).some((pkg) =>
      (pkg?.shippingRates ?? []).some((rate) => rate?.selected),
    );
  const isSettledFreeCart = zeroTotal && shippingSettled;
  if (!isSettledFreeCart) {
    try {
      // Only request shipping-address collection when the cart actually needs
      // shipping. For digital/no-shipping carts the session must NOT require a
      // shipping address (the billing-only UI never sets one → confirm() would fail).
      const shippingCountries = cart.needsShipping ? ["AU", "NZ"] : [];
      // ENG-801: no email at create — see comment above `customerEmail`.
      const session = await createCheckoutSessionAction(
        returnUrl,
        undefined,
        shippingCountries,
        successBaseUrl,
      );
      if (
        !session.clientSecret ||
        !session.sessionId ||
        !session.publishableKey
      ) {
        redirect("/checkout/error?reason=invalid_session");
      }
      checkoutSession = {
        clientSecret: session.clientSecret,
        sessionId: session.sessionId,
        publishableKey: session.publishableKey,
        stripeAccountId: session.stripeAccountId ?? null,
        shippingOptionMapping: session.shippingOptionMapping ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const params = new URLSearchParams({
        reason: "session_creation_failed",
        message,
      });
      redirect(`/checkout/error?${params.toString()}`);
    }
  }

  let pickupLocations: Array<{
    name: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    postcode: string;
    country: string;
    countryCode: string;
    shippingMethodId: string;
  }> = [];
  try {
    const sdk = createServerHeadkit();
    const apiLocs = await sdk.pickupLocations.list();
    pickupLocations = apiLocs.map((l) => ({
      name: l.name,
      address: l.address,
      city: l.city,
      state: l.state,
      stateCode: l.stateCode ?? "",
      postcode: l.postcode,
      country: l.country,
      countryCode: l.countryCode ?? "",
      shippingMethodId: l.shippingMethodId,
    }));
  } catch {
    // Fallback: checkout will use cart-derived list with empty addresses
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Payment failed banner (ENG-789: retry after Afterpay/BNPL decline) */}
      {paymentFailed && <PaymentFailedBanner />}
      {/* Cart changed banner (ENG-784: session expired mid-redirect because
          the cart drifted; nothing was charged) */}
      {cartChanged && <CartChangedBanner />}
      {/* Stock correction banner */}
      {stockCorrectionMessage && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-amber-800">{stockCorrectionMessage}</p>
          </div>
        </div>
      )}
      <CheckoutPageContent
        initialCart={cart as unknown as CartFieldsFragment}
        checkoutSession={checkoutSession}
        pickupLocations={pickupLocations}
        returnUrl={returnUrl}
        {...(successBaseUrl && { successBaseUrl })}
        {...(customerEmail && { customerEmail })}
        isAuthenticated={isAuthenticated}
        allowedCountries={["AU", "NZ"]}
      />
    </div>
  );
}
