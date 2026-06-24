"use client";

import React, { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckoutForm } from "@/app/checkout/CheckoutForm";
import { Button } from "@/components/ui/button";
import { Cart } from "@/components/checkout/cart";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { getFloatVal, formatPrice, cn } from "@/lib/utils";
import { ChevronDownIcon } from "@/components/icon";
import type { CartFieldsFragment } from "@headkit/sdk";
import {
  createCheckoutSessionAction,
  getCheckoutAction,
} from "@/app/checkout/actions";
import type { Step } from "@/app/checkout/CheckoutForm";
function CheckoutErrorHandler({
  onError,
}: {
  onError: (error: string) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      switch (error) {
        case "payment_failed":
          onError("Payment failed. Please try again.");
          break;
        case "checkout_failed":
          onError(
            "There was an issue processing your order. Please try again.",
          );
          break;
        case "stripe_error":
          onError(
            "There was an issue with the payment processor. Please try again.",
          );
          break;
        default:
          onError("An error occurred. Please try again.");
      }
    }
  }, [searchParams, onError]);

  return null;
}

export type ShippingOptionMappingItem = {
  rateId: string;
  stripeShippingRateId: string;
};

export type CheckoutSessionProp = {
  clientSecret: string;
  sessionId: string;
  publishableKey: string;
  stripeAccountId?: string | null;
  /** Maps cart rateId to Stripe shipping rate ID for updateShippingOption. */
  shippingOptionMapping?: ShippingOptionMappingItem[] | null;
};

export type PickupLocationItem = {
  name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  /** ISO 2-letter country code (e.g. AU) — required for Stripe */
  countryCode: string;
  shippingMethodId: string;
};

interface CheckoutPageContentProps {
  initialCart?: CartFieldsFragment | null;
  checkoutSession?: CheckoutSessionProp | null;
  pickupLocations?: PickupLocationItem[];
  returnUrl?: string;
  successBaseUrl?: string;
  allowedCountries?: string[];
}

export function CheckoutPageContent({
  initialCart,
  checkoutSession: initialCheckoutSession,
  pickupLocations: pickupLocationsFromApi = [],
  returnUrl,
  successBaseUrl,
  allowedCountries = ["AU", "NZ"],
}: CheckoutPageContentProps) {
  const router = useRouter();
  const { cartData, setCartData, toggleCart } = useCartContext();
  const [showCart, setShowCart] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkoutSession, setCheckoutSession] =
    useState<CheckoutSessionProp | null>(initialCheckoutSession ?? null);
  const [restoreStep, setRestoreStep] = useState<string | null>(null);
  const [restoredEmail, setRestoredEmail] = useState<string | null>(null);
  const [isPlacingFreeOrder, setIsPlacingFreeOrder] = useState(false);

  const refreshSession = useCallback(
    async (newEmail: string, nextStep: string) => {
      if (!returnUrl) throw new Error("Return URL not configured");
      // Cart is already updated by ContactFormStep before calling this.
      // Only request shipping-address collection when the cart needs shipping —
      // otherwise the recreated session would require a shipping address that the
      // billing-only UI never sets, breaking confirm().
      const shippingCountries = cartData?.needsShipping ? allowedCountries : [];
      const session = await createCheckoutSessionAction(
        returnUrl,
        newEmail,
        undefined,
        shippingCountries,
        successBaseUrl,
      );
      if (
        !session.clientSecret ||
        !session.sessionId ||
        !session.publishableKey
      ) {
        throw new Error("Failed to create checkout session");
      }
      setCheckoutSession({
        clientSecret: session.clientSecret,
        sessionId: session.sessionId,
        publishableKey: session.publishableKey,
        stripeAccountId: session.stripeAccountId ?? null,
        shippingOptionMapping: session.shippingOptionMapping ?? null,
      });
      setRestoreStep(nextStep);
      setRestoredEmail(newEmail);
    },
    [returnUrl, successBaseUrl, allowedCountries, cartData?.needsShipping],
  );

  // PAY-05: free-order (zero-total) confirm. A cart with items but a $0 total
  // (100%-off coupon, gift, free sample) has no payment step. We capture the
  // draft order id/key, then trigger the SERVER-SIDE zero-total bypass
  // (createCheckoutSession finalizes the WC order WITHOUT a Stripe session),
  // then route to the existing success page. No Stripe / CheckoutProvider.
  const placeFreeOrder = useCallback(async () => {
    if (!returnUrl) {
      setErrorMessage("Return URL not configured");
      return;
    }
    setIsPlacingFreeOrder(true);
    setErrorMessage("");
    try {
      // Capture order identifiers from the draft order BEFORE finalizing.
      const draft = await getCheckoutAction();
      if (!draft?.orderId || !draft?.orderKey) {
        throw new Error("Could not resolve the draft order.");
      }
      // Server-side zero-total bypass: finalizes the WC order, no Stripe.
      // Free orders never need shipping-address collection by Stripe.
      const res = await createCheckoutSessionAction(
        returnUrl,
        undefined,
        undefined,
        [],
        successBaseUrl,
      );
      // HI-02 (code review): trust the SERVER's zero-total decision, not the
      // client's possibly-stale cart total. If the cart total changed between
      // render and server eval, the server takes the PAID branch and returns a
      // real Stripe session (non-empty clientSecret/sessionId) expecting payment.
      // Routing such a result to /success would place an order with NO payment
      // collected, so stop and ask the user to refresh instead.
      if (res?.clientSecret || res?.sessionId) {
        setErrorMessage(
          "Your cart total changed and now requires payment. Please refresh and try again.",
        );
        setIsPlacingFreeOrder(false);
        return;
      }
      router.push(
        `/checkout/success/${encodeURIComponent(
          draft.orderId,
        )}?key=${encodeURIComponent(draft.orderKey)}`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not complete your free order. Please try again.",
      );
      setIsPlacingFreeOrder(false);
    }
  }, [returnUrl, successBaseUrl, router]);

  useEffect(() => {
    toggleCart(false);
    window.scrollTo(0, 0);
    if (initialCart && !cartData) {
      setCartData(initialCart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialStep = restoreStep;
  const initialEmail = restoredEmail;
  useEffect(() => {
    if (restoreStep) {
      setRestoreStep(null);
      setRestoredEmail(null);
    }
  }, [restoreStep]);

  const hasItems = (cartData?.items.length ?? 0) > 0;
  const cartTotal = getFloatVal(cartData?.totals.totalPrice ?? "0");
  const currency = cartData?.currency.code ?? "AUD";
  const itemCount = cartData?.itemsCount ?? 0;

  // Genuinely-empty cart: no cart, or no items. NOT a $0-total cart-with-items.
  if (!cartData || !hasItems) {
    return (
      <div className="min-h-[700px] py-10 px-[20px] md:px-32 pb-[30px] md:py-[60px] text-center">
        <div className="w-[500px] max-w-full mx-auto">
          <p className="mb-4 font-bold leading-10">No products in your cart!</p>
          <p className="mb-10">
            Browse our selection to find something you love.
          </p>
          <Link href="/">
            <Button fullWidth onClick={() => toggleCart(false)}>
              Start shopping
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // PAY-05: free order — has items but a $0 total. No payment step; confirm
  // routes through the server-side zero-total bypass (no Stripe), distinct from
  // the empty-cart message above.
  if (cartTotal <= 0) {
    return (
      <div className="min-h-[700px] py-10 px-[20px] md:px-32 pb-[30px] md:py-[60px] text-center">
        <div className="w-[500px] max-w-full mx-auto">
          <p className="mb-4 font-bold leading-10">No payment required</p>
          <p className="mb-2">
            Your order total is {formatPrice(0, currency)}. There&apos;s nothing
            to pay — confirm to place your order.
          </p>
          <p className="mb-10 text-sm text-gray-500">
            {itemCount} {itemCount === 1 ? "item" : "items"} in your order.
          </p>
          {errorMessage && (
            <div className="text-red-500 text-center mb-4">{errorMessage}</div>
          )}
          <Button
            fullWidth
            onClick={placeFreeOrder}
            disabled={isPlacingFreeOrder}
          >
            {isPlacingFreeOrder ? "Placing order…" : "Place order"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[700px] py-10">
      <Suspense fallback={null}>
        <CheckoutErrorHandler onError={setErrorMessage} />
      </Suspense>

      {errorMessage && (
        <div className="text-red-500 text-center mb-4 px-[20px] md:px-[40px]">
          {errorMessage}
        </div>
      )}

      {checkoutSession ? (
        <CheckoutForm
          checkoutSession={checkoutSession}
          pickupLocationsFromApi={pickupLocationsFromApi}
          {...(returnUrl && { onRefreshSession: refreshSession })}
          {...(initialStep && { initialStep: initialStep as Step })}
          {...(initialEmail && { initialEmail })}
          cartSidebar={
            <div className="px-[20px] py-[17px] md:py-0 border-y border-[#d6d6d6] md:border-0">
              {/* Mobile toggle */}
              <div
                className="md:hidden flex justify-between cursor-pointer"
                onClick={() => setShowCart(!showCart)}
              >
                <span className="font-medium">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
                <span className="font-medium flex items-center">
                  {formatPrice(
                    getFloatVal(cartData.totals.totalItems) +
                      getFloatVal(cartData.totals.totalItemsTax),
                    currency,
                  )}
                  <ChevronDownIcon
                    className={cn(
                      "mt-[2px] ml-[10px] h-[24px] w-[12px] transition-transform",
                      { "rotate-180": showCart },
                    )}
                  />
                </span>
              </div>

              {/* Cart contents */}
              <div
                className={cn("hidden md:block transition-all", {
                  "block! mt-[20px]": showCart,
                })}
              >
                <Cart showDisplayShipping={true} />
              </div>
            </div>
          }
        />
      ) : null}
    </div>
  );
}
