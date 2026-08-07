"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CartFieldsFragment } from "@headkit/sdk";
import { Cart } from "@/components/checkout/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import {
  processCheckoutAction,
  selectShippingRateAction,
  updateCustomerAction,
} from "@/app/checkout/actions";

/** Offline Woo gateway registered by the HeadKit theme (Pending payment). */
const QUOTE_PAYMENT_METHOD = "headkit-quote";

type QuoteFormState = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  customerNote: string;
};

const INITIAL_FORM: QuoteFormState = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postcode: "",
  country: "AU",
  customerNote: "",
};

export type QuoteCheckoutProps = {
  initialCart: CartFieldsFragment;
  customerEmail?: string;
};

/**
 * HeadKit Quote checkout — item summary left, details form right.
 * No Stripe; submits via processCheckout with the headkit-quote gateway.
 */
export function QuoteCheckout({
  initialCart,
  customerEmail,
}: QuoteCheckoutProps): React.ReactElement {
  const router = useRouter();
  const { cartData, setCartData, toggleCart } = useCartContext();
  const [form, setForm] = useState<QuoteFormState>(() => ({
    ...INITIAL_FORM,
    email: customerEmail ?? "",
  }));
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    toggleCart(false);
    window.scrollTo(0, 0);
    if (!cartData) {
      setCartData(initialCart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once on mount
  }, []);

  const setField = useCallback((field: keyof QuoteFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const submitQuote = useCallback(() => {
    startTransition(async () => {
      setErrorMessage("");

      const trimmed = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim()]),
      ) as QuoteFormState;

      if (!trimmed.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
        setErrorMessage("Please enter a valid email address.");
        return;
      }
      if (
        !trimmed.firstName ||
        !trimmed.lastName ||
        !trimmed.address1 ||
        !trimmed.city ||
        !trimmed.state ||
        !trimmed.postcode
      ) {
        setErrorMessage(
          "Please complete your name and address so we can prepare your quote.",
        );
        return;
      }

      const address = {
        firstName: trimmed.firstName,
        lastName: trimmed.lastName,
        address1: trimmed.address1,
        address2: trimmed.address2,
        city: trimmed.city,
        state: trimmed.state.toUpperCase(),
        postcode: trimmed.postcode,
        country: trimmed.country || "AU",
        email: trimmed.email,
        phone: trimmed.phone,
      };

      try {
        // Push billing + shipping onto the cart session before finalize.
        let cart = await updateCustomerAction({
          billingAddress: address,
          shippingAddress: {
            firstName: address.firstName,
            lastName: address.lastName,
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            state: address.state,
            postcode: address.postcode,
            country: address.country,
            phone: address.phone,
          },
        });
        setCartData(cart);

        // If the cart needs shipping, select the first available rate.
        if (cart.needsShipping) {
          const pkg = (cart.shippingRates ?? []).find(
            (p) => (p?.shippingRates?.length ?? 0) > 0,
          );
          const selected =
            pkg?.shippingRates?.find((r) => r?.selected) ??
            pkg?.shippingRates?.[0];
          if (pkg?.packageId != null && selected?.rateId) {
            if (!selected.selected) {
              cart = await selectShippingRateAction(
                String(pkg.packageId),
                selected.rateId,
              );
              setCartData(cart);
            }
          } else {
            setErrorMessage(
              "We could not determine shipping for this address. Please check your details and try again.",
            );
            return;
          }
        }

        const order = await processCheckoutAction({
          paymentMethod: QUOTE_PAYMENT_METHOD,
          billingAddress: address,
          shippingAddress: {
            firstName: address.firstName,
            lastName: address.lastName,
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            state: address.state,
            postcode: address.postcode,
            country: address.country,
            phone: address.phone,
          },
          ...(trimmed.customerNote
            ? { customerNote: trimmed.customerNote }
            : {}),
        });

        const orderId = order.orderId;
        const orderKey = order.orderKey;
        if (!orderId || !orderKey || orderId === "0") {
          throw new Error(
            "Your quote was submitted, but we could not open the confirmation page. Please check your email.",
          );
        }

        router.push(
          `/checkout/success/${encodeURIComponent(orderId)}?key=${encodeURIComponent(orderKey)}`,
        );
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Could not submit your quote. Please try again.",
        );
      }
    });
  }, [form, router, setCartData]);

  const activeCart = cartData ?? initialCart;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-16">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-medium tracking-tight text-brand-fg md:text-4xl">
          Quote
        </h1>
        <p className="mt-3 text-base text-brand-fg/80 md:text-lg">
          Review your items below and complete your details so we can provide
          you pricing and assistance with your project.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
        {/* Item summary — left column */}
        <aside className="md:col-span-5 md:order-1">
          <h2 className="mb-4 text-lg font-medium text-brand-fg">Your items</h2>
          <Cart />
          {(activeCart.itemsCount ?? 0) === 0 && (
            <p className="text-sm text-brand-fg/70">Your quote is empty.</p>
          )}
        </aside>

        {/* Details form — right column */}
        <section className="md:col-span-7 md:order-2">
          <h2 className="mb-4 text-lg font-medium text-brand-fg">
            Your details
          </h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="quote-email">Email</Label>
              <Input
                id="quote-email"
                type="email"
                autoComplete="email"
                className="mt-1.5"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="quote-first-name">First name</Label>
                <Input
                  id="quote-first-name"
                  autoComplete="given-name"
                  className="mt-1.5"
                  value={form.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div>
                <Label htmlFor="quote-last-name">Last name</Label>
                <Input
                  id="quote-last-name"
                  autoComplete="family-name"
                  className="mt-1.5"
                  value={form.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="quote-phone">Phone (optional)</Label>
              <Input
                id="quote-phone"
                type="tel"
                autoComplete="tel"
                className="mt-1.5"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                disabled={isPending}
              />
            </div>

            <div>
              <Label htmlFor="quote-address1">Street address</Label>
              <Input
                id="quote-address1"
                autoComplete="address-line1"
                className="mt-1.5"
                value={form.address1}
                onChange={(e) => setField("address1", e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div>
              <Label htmlFor="quote-address2">
                Apartment, suite, etc. (optional)
              </Label>
              <Input
                id="quote-address2"
                autoComplete="address-line2"
                className="mt-1.5"
                value={form.address2}
                onChange={(e) => setField("address2", e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="quote-city">Suburb</Label>
                <Input
                  id="quote-city"
                  autoComplete="address-level2"
                  className="mt-1.5"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div>
                <Label htmlFor="quote-state">State</Label>
                <Input
                  id="quote-state"
                  autoComplete="address-level1"
                  placeholder="NSW"
                  className="mt-1.5"
                  value={form.state}
                  onChange={(e) => setField("state", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div>
                <Label htmlFor="quote-postcode">Postcode</Label>
                <Input
                  id="quote-postcode"
                  autoComplete="postal-code"
                  className="mt-1.5"
                  value={form.postcode}
                  onChange={(e) => setField("postcode", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="quote-country">Country</Label>
              <select
                id="quote-country"
                autoComplete="country"
                className="mt-1.5 flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
                disabled={isPending}
              >
                <option value="AU">Australia</option>
                <option value="NZ">New Zealand</option>
              </select>
            </div>

            <div>
              <Label htmlFor="quote-note">Project notes (optional)</Label>
              <Textarea
                id="quote-note"
                className="mt-1.5"
                rows={4}
                placeholder="Tell us about your project or any questions…"
                value={form.customerNote}
                onChange={(e) => setField("customerNote", e.target.value)}
                disabled={isPending}
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-red-600" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <Button
              fullWidth
              onClick={submitQuote}
              disabled={isPending}
              loading={isPending}
              loadingText="Submitting quote…"
              rightIcon="arrowRight"
              className="mt-2"
            >
              Submit Quote
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
