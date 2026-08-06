import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateCartStock, autoCorrectCart } from "@/lib/cart-validation";
import { createCheckoutSessionAction } from "@/app/checkout/actions";
import { CheckoutPageContent } from "@/app/checkout/checkout-page-content";
import type { CartFieldsFragment } from "@headkit/sdk";
import { getFullCartAction } from "@/lib/cart-actions";
import { getCustomer } from "@/lib/account-actions";
import { getAuthToken } from "@/lib/auth-cookie";
import { resolveCheckoutEmail } from "@/lib/checkout-email";
import { getFloatVal } from "@/lib/utils";
import { createServerHeadkit } from "@/lib/sdk.server";
import { PaymentFailedBanner } from "@/components/checkout/payment-failed-banner";
import { CartChangedBanner } from "@/components/checkout/cart-changed-banner";
import { getBranding } from "@/lib/branding";
import { normalizeCheckoutMode } from "@/lib/checkout-mode";

/**
 * HeadKit Quote checkout — duplicated from /checkout as a starting point.
 * Quote-mode storefronts land here; further Quote UX customisation comes next.
 */
export default async function QuoteCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeSettings } = await getBranding();
  const mode = normalizeCheckoutMode(storeSettings.checkoutType);
  if (mode !== "quote") {
    redirect("/checkout");
  }

  const { error } = await searchParams;
  const paymentFailed = error === "payment_failed";
  const cartChanged = error === "cart_changed";

  let cart = await getFullCartAction();

  if (!cart) {
    redirect("/quote/error?reason=session_expired");
  }
  if (cart.itemsCount === 0) {
    redirect("/quote/error?reason=empty_cart");
  }

  const validation = validateCartStock(cart.items);
  let stockCorrectionMessage: string | null = null;

  if (!validation.isValid) {
    const correction = await autoCorrectCart(validation.issues);
    stockCorrectionMessage = correction.message;

    cart = await getFullCartAction();

    if (!cart || cart.itemsCount === 0) {
      redirect("/quote/error?reason=stock_correction_empty");
    }
  }

  // Until Quote checkout is customised, reuse the same Stripe session flow and
  // success URLs as HeadKit Custom so payment/webhooks keep working.
  const returnUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const successBaseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  const authToken = getAuthToken(await cookies());
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

  const zeroTotal = getFloatVal(cart.totals.totalPrice ?? "0") <= 0;
  const shippingSettled =
    !cart.needsShipping ||
    (cart.shippingRates ?? []).some((pkg) =>
      (pkg?.shippingRates ?? []).some((rate) => rate?.selected),
    );
  const isSettledFreeCart = zeroTotal && shippingSettled;
  if (!isSettledFreeCart) {
    try {
      const shippingCountries = cart.needsShipping ? ["AU", "NZ"] : [];
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
        redirect("/quote/error?reason=invalid_session");
      }
      checkoutSession = {
        clientSecret: session.clientSecret,
        sessionId: session.sessionId,
        publishableKey: session.publishableKey,
        stripeAccountId: session.stripeAccountId ?? null,
        shippingOptionMapping: session.shippingOptionMapping ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const params = new URLSearchParams({
        reason: "session_creation_failed",
        message,
      });
      redirect(`/quote/error?${params.toString()}`);
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
    <div className="min-h-screen bg-brand-bg">
      {paymentFailed && <PaymentFailedBanner />}
      {cartChanged && <CartChangedBanner />}
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
