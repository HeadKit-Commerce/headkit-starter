"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CartFieldsFragment } from "@headkit/sdk";
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
import { QuoteCartItems } from "@/components/quote/quote-cart-items";
import {
  AU_STATES,
  QUOTE_DETAILS_COOKIE,
  QUOTE_INDUSTRIES,
  QUOTE_PAYMENT_METHOD,
  buildQuotePlaceholderAddress,
  encodeQuoteDetailsCookie,
  type QuoteFormDetails,
} from "@/lib/quote-form";

const INITIAL_FORM: QuoteFormDetails = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  company: "",
  industry: "",
  state: "",
  comments: "",
};

const selectClassName =
  "mt-1.5 flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm";

export type QuoteCheckoutProps = {
  initialCart: CartFieldsFragment;
  customerEmail?: string;
};

/**
 * HeadKit Quote checkout — item summary left, details form right.
 * No Stripe; submits via processCheckout with the headkit-quote gateway.
 *
 * WooCommerce still requires billing identity (name + email) and, for
 * shippable carts, a resolvable address + selected shipping rate. Street
 * address / suburb / postcode are filled with placeholders server-side so the
 * form can stay focused on quote fields.
 */
export function QuoteCheckout({
  initialCart,
  customerEmail,
}: QuoteCheckoutProps): React.ReactElement {
  const router = useRouter();
  const { cartData, setCartData, toggleCart } = useCartContext();
  const [form, setForm] = useState<QuoteFormDetails>(() => ({
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

  const setField = useCallback(
    (field: keyof QuoteFormDetails, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const submitQuote = useCallback(() => {
    startTransition(async () => {
      setErrorMessage("");

      const trimmed = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim()]),
      ) as QuoteFormDetails;

      if (!trimmed.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
        setErrorMessage("Please enter a valid email address.");
        return;
      }
      if (!trimmed.firstName || !trimmed.lastName) {
        setErrorMessage("Please enter your first and last name.");
        return;
      }
      if (!trimmed.phone) {
        setErrorMessage("Please enter a phone number.");
        return;
      }
      if (!trimmed.company) {
        setErrorMessage("Please enter your company.");
        return;
      }
      if (!trimmed.industry) {
        setErrorMessage("Please select an industry.");
        return;
      }
      if (!trimmed.state) {
        setErrorMessage("Please select a state.");
        return;
      }

      const address = buildQuotePlaceholderAddress(trimmed);

      try {
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
              "We could not determine shipping for this quote. Please try again or contact us.",
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
          paymentData: [
            { key: "headkit_quote_company", value: trimmed.company },
            { key: "headkit_quote_industry", value: trimmed.industry },
          ],
          ...(trimmed.comments ? { customerNote: trimmed.comments } : {}),
        });

        const orderId = order.orderId;
        const orderKey = order.orderKey;
        if (!orderId || !orderKey || orderId === "0") {
          throw new Error(
            "Your quote was submitted, but we could not open the confirmation page. Please check your email.",
          );
        }

        document.cookie = `${QUOTE_DETAILS_COOKIE}=${encodeQuoteDetailsCookie(trimmed)}; path=/; max-age=3600; samesite=lax`;

        router.push(
          `/quote/success/${encodeURIComponent(orderId)}?key=${encodeURIComponent(orderKey)}`,
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
    <div className="px-5 py-10 md:px-10 md:py-16">
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
        <aside className="md:col-span-5 md:order-1">
          <h2 className="mb-4 text-lg font-medium text-brand-fg">Your items</h2>
          <QuoteCartItems
            items={activeCart.items}
            showQuantityControls
          />
          {(activeCart.itemsCount ?? 0) === 0 && (
            <p className="text-sm text-brand-fg/70">Your quote is empty.</p>
          )}
        </aside>

        <section className="md:col-span-7 md:order-2">
          <h2 className="mb-4 text-lg font-medium text-brand-fg">
            Your details
          </h2>

          <div className="space-y-4">
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

            <div>
              <Label htmlFor="quote-phone">Phone</Label>
              <Input
                id="quote-phone"
                type="tel"
                autoComplete="tel"
                className="mt-1.5"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div>
              <Label htmlFor="quote-company">Company</Label>
              <Input
                id="quote-company"
                autoComplete="organization"
                className="mt-1.5"
                value={form.company}
                onChange={(e) => setField("company", e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div>
              <Label htmlFor="quote-industry">Industry</Label>
              <select
                id="quote-industry"
                className={selectClassName}
                value={form.industry}
                onChange={(e) => setField("industry", e.target.value)}
                disabled={isPending}
                required
              >
                <option value="">Select industry</option>
                {QUOTE_INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="quote-state">State</Label>
              <select
                id="quote-state"
                autoComplete="address-level1"
                className={selectClassName}
                value={form.state}
                onChange={(e) => setField("state", e.target.value)}
                disabled={isPending}
                required
              >
                <option value="">Select state</option>
                {AU_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="quote-comments">Comments</Label>
              <Textarea
                id="quote-comments"
                className="mt-1.5"
                rows={5}
                placeholder="How can we help? Please provide as much information about your project and products required..."
                value={form.comments}
                onChange={(e) => setField("comments", e.target.value)}
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
              disabled={isPending || (activeCart.itemsCount ?? 0) === 0}
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
