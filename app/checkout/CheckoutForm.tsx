"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import { AccordionWrapper } from "@/components/checkout/accordion-wrapper";
import {
  CheckoutFormStepEnum,
  DeliveryStepEnum,
} from "@/components/checkout/utils";
import { ContactFormStep } from "@/components/checkout/steps/contact-form-step";
import { DeliveryMethodStep } from "@/components/checkout/steps/delivery-method-step";
import { ShippingOptionsStep } from "@/components/checkout/steps/shipping-options-step";
import { BillingAddressStep } from "@/components/checkout/steps/billing-address-step";
import { StripePaymentStep } from "@/components/checkout/steps/stripe-checkout-step";
import { ExpressCheckoutTop } from "@/components/checkout/express-checkout-top";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import type { CheckoutSessionProp } from "@/app/checkout/checkout-page-content";
import {
  CheckoutActionsProvider,
  useCheckoutActions,
} from "@/app/checkout/checkout-actions-context";
import {
  getFullCartAction,
  selectShippingAction,
  updateCustomerAddressAction,
} from "@/lib/cart-actions";
import type { AddressInput } from "@headkit/sdk";
import { useDebugRegister } from "@headkit/sdk/debug";
import { SpinnerIcon } from "@/components/icon";
import {
  writeBillingAddressCookie,
  clearBillingAddressCookie,
} from "@/lib/checkout-billing-cookie";
import { getEmailMarketingStatusAction } from "@/lib/email-marketing-actions";

export type Step =
  | CheckoutFormStepEnum.CONTACT
  | CheckoutFormStepEnum.DELIVERY_METHOD
  | CheckoutFormStepEnum.ADDRESS
  | CheckoutFormStepEnum.PAYMENT;

interface PickupLocationItem {
  address: string;
  city: string;
  country: string;
  countryCode: string;
  name: string;
  postcode: string;
  shippingMethodId: string;
  state: string;
  stateCode: string;
}

interface FormData {
  email: string;
  newsletter: boolean;
  deliveryMethod: DeliveryStepEnum;
  shippingAddress: AddressInput | null;
  billingAddress: AddressInput | null;
  shippingPackageId?: string;
  shippingRateId?: string;
  shippingRateName?: string;
  /** Selected pickup rate id when delivery is Click & Collect */
  pickupLocationRateId?: string;
}

function CheckoutSteps({
  sessionId,
  shippingOptionMapping,
  pickupLocationsFromApi = [],
  onSyncComplete,
  initialStep,
  initialEmail,
  onRefreshSession,
}: {
  sessionId: string;
  shippingOptionMapping?: Array<{
    rateId: string;
    stripeShippingRateId: string;
  }>;
  /** Pickup locations from API (with full address). Merged with cart rates. */
  pickupLocationsFromApi?: Array<{
    name: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    postcode: string;
    country: string;
    countryCode: string;
    shippingMethodId: string;
  }>;
  /** Called when sync returns; use to refresh mapping (Stripe recreates shipping rate IDs on sync). */
  onSyncComplete?: (
    mapping: Array<{ rateId: string; stripeShippingRateId: string }> | null,
  ) => void;
  initialStep?: Step;
  initialEmail?: string;
  onRefreshSession?: (
    email: string,
    nextStep: string,
    opts?: { notice?: "cart_changed" },
  ) => Promise<void>;
  /**
   * ENG-783: logged-in shopper. Accepted (threading stays in place) but not
   * consumed at the step level — the actual prefill gate lives one level up
   * in CheckoutForm (provider `defaultValues.email` is suppressed for authed
   * shoppers). Not destructured to avoid an unused-var warning.
   */
  isAuthenticated?: boolean;
}) {
  const { cartData, setCartData } = useCartContext();

  const pickupLocations = useMemo((): PickupLocationItem[] => {
    if (!cartData?.shippingRates) return [];
    const apiMap = new Map(
      pickupLocationsFromApi.map((l) => [l.shippingMethodId, l]),
    );
    const list: PickupLocationItem[] = [];
    for (const pkg of cartData.shippingRates) {
      for (const rate of pkg.shippingRates) {
        if (
          rate.rateId.includes("local_pickup") ||
          rate.rateId.includes("pickup_location")
        ) {
          const apiLoc = apiMap.get(rate.rateId);
          list.push({
            name: apiLoc?.name ?? rate.name,
            shippingMethodId: rate.rateId,
            address: apiLoc?.address ?? "",
            city: apiLoc?.city ?? "",
            state: apiLoc?.state ?? "",
            stateCode: apiLoc?.stateCode ?? "",
            postcode: apiLoc?.postcode ?? "",
            country: apiLoc?.country ?? "",
            countryCode: apiLoc?.countryCode ?? "",
          });
        }
      }
    }
    return list;
  }, [cartData?.shippingRates, pickupLocationsFromApi]);

  const [currentStep, setCurrentStep] = useState<Step>(
    initialStep ?? CheckoutFormStepEnum.CONTACT,
  );
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(() => {
    if (initialStep && initialStep !== CheckoutFormStepEnum.CONTACT) {
      return new Set([CheckoutFormStepEnum.CONTACT]);
    }
    return new Set();
  });

  const [emailMarketingEnabled, setEmailMarketingEnabled] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    email: initialEmail ?? "",
    newsletter: false,
    deliveryMethod: DeliveryStepEnum.SHIPPING_TO_HOME,
    shippingAddress: null,
    billingAddress: null,
  });

  useEffect(() => {
    let cancelled = false;
    void getEmailMarketingStatusAction().then((status) => {
      if (!cancelled) setEmailMarketingEnabled(status.enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Prefer cartData from context when available for faster email prefill (cart may have billingAddress from GetCart)
    const billingFromContext = (
      cartData as { billingAddress?: { email?: string } } | null
    )?.billingAddress;
    if (billingFromContext?.email) {
      setFormData((prev) =>
        prev.email ? prev : { ...prev, email: billingFromContext.email ?? "" },
      );
    }
    getFullCartAction().then((fullCart) => {
      if (cancelled || !fullCart) return;
      const billing = fullCart.billingAddress;
      const shipping = fullCart.shippingAddress;
      setFormData((prev) => ({
        ...prev,
        email: prev.email || billing?.email || "",
        shippingAddress:
          prev.shippingAddress ??
          (shipping?.address1
            ? {
                firstName: shipping.firstName,
                lastName: shipping.lastName,
                address1: shipping.address1,
                address2: shipping.address2,
                city: shipping.city,
                state: shipping.state,
                postcode: shipping.postcode,
                country: shipping.country,
                // WC's primary phone is billing_phone; shipping_phone is often
                // blank. Fall back to the billing phone so the delivery
                // PhoneInput prefills (it derives country from the E.164 prefix,
                // else the saved address country). Guest → both empty → "".
                phone: shipping.phone || billing?.phone || "",
              }
            : null),
        billingAddress:
          prev.billingAddress ??
          (billing?.address1
            ? {
                firstName: billing.firstName,
                lastName: billing.lastName,
                address1: billing.address1,
                address2: billing.address2,
                city: billing.city,
                state: billing.state,
                postcode: billing.postcode,
                country: billing.country,
                phone: billing.phone,
              }
            : null),
      }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    (cartData as { billingAddress?: { email?: string } } | null)?.billingAddress
      ?.email,
  ]);

  // ENG-784 dead-session recovery: ONE auto-recreate per dead session. The
  // ref is keyed by sessionId (not a boolean) so a later, different dead
  // session can still recover, while retries against the SAME dead session
  // can never loop the recreate. onRefreshSession swaps the session in
  // checkout-page-content; the provider keyed by sessionId remounts cleanly
  // and resumes at the current step with the cart-changed notice.
  const sessionExpiredHandledRef = useRef<string | null>(null);
  const handleSessionExpired = useCallback(() => {
    if (!onRefreshSession) return;
    if (sessionExpiredHandledRef.current === sessionId) return;
    sessionExpiredHandledRef.current = sessionId;
    void onRefreshSession(formData.email, currentStep, {
      notice: "cart_changed",
    }).catch(() => {});
  }, [onRefreshSession, sessionId, formData.email, currentStep]);

  // Sync line items via Stripe runServerUpdate when cart total changes.
  // Uses Route Handler to avoid Server Action revalidation.
  // Parse response for shippingOptionMapping — Stripe recreates shipping rate IDs on sync.
  const { actions } = useCheckoutActions();
  useEffect(() => {
    if (!sessionId || !cartData?.totals?.totalPrice || !actions) return;
    actions
      .runServerUpdate(async () => {
        const res = await fetch("/api/checkout/sync-line-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        // ENG-784 (D7): 409 {ok:false, sessionStatus} is the route's
        // server-verified dead-session signal — the ONE case un-swallowed
        // from this effect's catch. Trigger the single auto-recreate and
        // return (nothing to sync against a dead session). All other
        // failures stay swallowed as transient below.
        if (res.status === 409) {
          handleSessionExpired();
          return;
        }
        if (!res.ok) throw new Error("Sync failed");
        const data = (await res.json()) as {
          ok?: boolean;
          shippingOptionMapping?: Array<{
            rateId: string;
            stripeShippingRateId: string;
          }> | null;
        };
        onSyncComplete?.(data.shippingOptionMapping ?? null);
      })
      .catch(() => {});
  }, [cartData, sessionId, actions, onSyncComplete, handleSessionExpired]);

  // ENG-801 session-email push: sessions are created email-LESS so the Stripe
  // email field stays editable (a `customer_email` set at create renders the
  // field read-only). This effect guarantees the session has an email before
  // payment WITHOUT re-submitting the contact step — critical for the
  // recreate path (refreshSession swaps in a new session and resumes at
  // DELIVERY, so the contact step never re-submits). Best-effort: failures
  // are swallowed (the contact-step submit and Stripe confirm-time validation
  // are the backstops); the email value is never logged (T-04.1-15). The
  // guard ref is keyed by sessionId — NOT a boolean — because refreshSession
  // replaces the session via state without remounting CheckoutSteps, and the
  // recreated session is exactly the one that needs the push.
  //
  // KEEP (quick-260714-n0w evidence): provider-level defaultValues.email does
  // NOT land the email on the session record by itself on fresh page loads —
  // boolean instrumentation showed the first success-state observation with
  // an EMPTY session email and this push firing (both the reload/prefill path
  // and the resume-past-contact path). Only on the fast recreate remount did
  // the element assert the (frozen) prefill onto the session before this
  // effect ran, making the push a self-noop. This push is therefore still
  // LOAD-BEARING and must stay.
  const checkoutState = useCheckout();
  const emailPushStateRef = useRef<{
    sessionId: string;
    attempts: number;
  } | null>(null);
  useEffect(() => {
    if (!actions || !sessionId) return;
    if (checkoutState.type !== "success") return;
    if (checkoutState.checkout.email?.trim()) return;
    const email = formData.email.trim();
    if (!email) return;
    // Bounded per-session retry (NOT strictly one-shot): the mount-time
    // line-items sync above races this push — runServerUpdate refreshes local
    // Stripe state from a snapshot that can predate the updateEmail, clobbering
    // the just-pushed email back to null. When that happens the effect re-runs
    // (session email empty again) and pushes once more; the attempt cap keeps a
    // genuinely-rejecting session from looping.
    const prev = emailPushStateRef.current;
    const attempts = prev?.sessionId === sessionId ? prev.attempts : 0;
    if (attempts >= 3) return;
    emailPushStateRef.current = { sessionId, attempts: attempts + 1 };
    actions.updateEmail(email).catch(() => {});
  }, [actions, checkoutState, formData.email, sessionId]);

  // Persist checkout data to a cookie so the success page can read it.
  useEffect(() => {
    const data = {
      email: formData.email,
      shippingAddress: formData.shippingAddress,
    };
    document.cookie = `hk-checkout-data=${encodeURIComponent(JSON.stringify(data))};path=/;max-age=3600;SameSite=Lax`;
  }, [formData.email, formData.shippingAddress]);

  // ENG-801: a billing cookie from a PREVIOUS checkout attempt must never
  // leak into this one (e.g. a distinct-billing attempt followed by a fresh
  // checkout paid via an express wallet, which writes no cookie). Clear it on
  // mount; it is re-written at the billing step / Pay click of THIS checkout.
  useEffect(() => {
    clearBillingAddressCookie();
  }, []);

  const markCompleted = (step: Step) => {
    setCompletedSteps((prev) => new Set([...prev, step]));
  };

  const goToStep = (step: Step) => {
    setCurrentStep(step);
  };

  const handleContactNext = async (data: {
    email: string;
    newsletter: boolean;
  }) => {
    setFormData((prev) => ({
      ...prev,
      email: data.email,
      newsletter: data.newsletter,
    }));
    markCompleted(CheckoutFormStepEnum.CONTACT);

    // Refetch cart so UI reflects updated billingAddress.email (same pattern as delivery step)
    const runGetCart = async () => {
      const fetchedCart = await getFullCartAction();
      if (fetchedCart) setCartData(fetchedCart);
    };
    if (actions) {
      const updateResult = await actions.runServerUpdate(runGetCart);
      if (updateResult.type === "error") {
        throw new Error(
          updateResult.error?.message ?? "Failed to refresh cart",
        );
      }
    } else {
      await runGetCart();
    }

    goToStep(CheckoutFormStepEnum.DELIVERY_METHOD);
  };

  const handleDeliveryNext = async (data: {
    deliveryMethod: DeliveryStepEnum;
    location?: string;
    shippingAddress?: {
      firstName?: string | undefined;
      lastName?: string | undefined;
      line1?: string | undefined;
      line2?: string | undefined;
      city?: string | undefined;
      state?: string | undefined;
      country?: string | undefined;
      postalCode?: string | undefined;
      phone?: string | undefined;
    };
  }) => {
    const shippingAddr =
      data.shippingAddress?.line1 != null &&
      data.shippingAddress.line1.trim() !== ""
        ? {
            firstName: data.shippingAddress.firstName ?? "",
            lastName: data.shippingAddress.lastName ?? "",
            address1: data.shippingAddress.line1 ?? "",
            address2: data.shippingAddress.line2 ?? "",
            city: data.shippingAddress.city ?? "",
            state: data.shippingAddress.state ?? "",
            postcode: data.shippingAddress.postalCode ?? "",
            country: data.shippingAddress.country ?? "",
            phone: data.shippingAddress.phone ?? "",
          }
        : null;

    setFormData((prev) => {
      const next: FormData = {
        ...prev,
        deliveryMethod: data.deliveryMethod,
        shippingAddress: shippingAddr ?? prev.shippingAddress,
      };
      if (
        data.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT &&
        data.location != null
      ) {
        next.pickupLocationRateId = data.location;
      }
      return next;
    });

    markCompleted(CheckoutFormStepEnum.DELIVERY_METHOD);

    // Click & Collect: select pickup rate on cart and update shipping address to pickup location
    if (
      data.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT &&
      data.location
    ) {
      const pkg = cartData?.shippingRates?.[0];
      const packageId = pkg?.packageId ?? "0";
      const loc = pickupLocations.find(
        (l) => l.shippingMethodId === data.location,
      );

      const runCartUpdates = async () => {
        // keepCheckoutSession: checkout-mounted mutation — the sync effect
        // re-syncs the live session's line items afterwards (ENG-784).
        const selectResult = await selectShippingAction(
          packageId,
          data.location!,
          { keepCheckoutSession: true },
        );
        if (!selectResult.success) throw new Error(selectResult.error);
        setCartData(selectResult.cart);

        if (loc) {
          const updateResult = await updateCustomerAddressAction(
            {
              shippingAddress: {
                firstName: "",
                lastName: "",
                address1: loc.address?.trim() || loc.name,
                address2: "",
                city: loc.city ?? "Pickup",
                // WooCommerce update-customer validates ISO codes — the display
                // names in `state`/`country` ("New South Wales"/"Australia") 400.
                state: loc.stateCode ?? "",
                postcode: loc.postcode ?? "",
                country: loc.countryCode ?? "",
                phone: "",
              },
            },
            { keepCheckoutSession: true },
          );
          if (!updateResult.success) throw new Error(updateResult.error);
          setCartData(updateResult.cart);
        }
      };

      if (actions) {
        const updateResult = await actions.runServerUpdate(runCartUpdates);
        if (updateResult.type === "error") {
          throw new Error(
            updateResult.error?.message ?? "Failed to update pickup selection",
          );
        }
      } else {
        await runCartUpdates();
      }
    }

    // Refetch cart for Ship to Home (address-specific shipping rates) or Click & Collect (selected pickup, updated address)
    let cartForStepDecision = cartData;
    if (
      data.deliveryMethod === DeliveryStepEnum.SHIPPING_TO_HOME ||
      data.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT
    ) {
      let fetchedCart: typeof cartData = null;
      const runGetCart = async () => {
        fetchedCart = await getFullCartAction();
        if (fetchedCart) setCartData(fetchedCart);
      };
      if (actions) {
        const updateResult = await actions.runServerUpdate(runGetCart);
        if (updateResult.type === "error") {
          throw new Error(
            updateResult.error?.message ?? "Failed to load shipping options",
          );
        }
        if (fetchedCart) cartForStepDecision = fetchedCart;
      } else {
        await runGetCart();
        if (fetchedCart) cartForStepDecision = fetchedCart;
      }
    }

    // Ship to Home + non-pickup rates → Shipping Options; Click & Collect → Billing
    const needsShippingOptions =
      data.deliveryMethod === DeliveryStepEnum.SHIPPING_TO_HOME &&
      (cartForStepDecision?.shippingRates ?? []).some((pkg) =>
        pkg.shippingRates.some(
          (r) =>
            !r.rateId.includes("local_pickup") &&
            !r.rateId.includes("pickup_location"),
        ),
      );

    if (needsShippingOptions) {
      goToStep(CheckoutFormStepEnum.ADDRESS);
    } else if (data.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT) {
      goToStep(CheckoutFormStepEnum.ADDRESS);
    } else {
      goToStep(CheckoutFormStepEnum.PAYMENT);
    }
  };

  const handleShippingOptionsNext = (data: {
    shippingPackageId: string;
    shippingRateId: string;
    shippingRateName: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      shippingPackageId: data.shippingPackageId,
      shippingRateId: data.shippingRateId,
      shippingRateName: data.shippingRateName,
    }));
    markCompleted(CheckoutFormStepEnum.ADDRESS);
    goToStep(CheckoutFormStepEnum.PAYMENT);
  };

  const handleBillingNext = (data: {
    billingAddress: {
      firstName: string;
      lastName: string;
      line1: string;
      line2?: string | undefined;
      city: string;
      state: string;
      country: string;
      postalCode: string;
      phone: string;
    };
  }) => {
    const billingAddr: AddressInput = {
      firstName: data.billingAddress.firstName,
      lastName: data.billingAddress.lastName,
      address1: data.billingAddress.line1,
      address2: data.billingAddress.line2 ?? "",
      city: data.billingAddress.city,
      state: data.billingAddress.state,
      postcode: data.billingAddress.postalCode,
      country: data.billingAddress.country,
      phone: data.billingAddress.phone,
    };
    // ENG-801: persist the entered billing for the success pages (the
    // session retrieve returns stale customer_details for a while after
    // updates — the cookie is the deterministic finalize source).
    writeBillingAddressCookie({
      firstName: billingAddr.firstName ?? "",
      lastName: billingAddr.lastName ?? "",
      address1: billingAddr.address1 ?? "",
      address2: billingAddr.address2 ?? "",
      city: billingAddr.city ?? "",
      state: billingAddr.state ?? "",
      postcode: billingAddr.postcode ?? "",
      country: billingAddr.country ?? "",
      ...(billingAddr.phone ? { phone: billingAddr.phone } : {}),
    });
    setFormData((prev) => ({ ...prev, billingAddress: billingAddr }));
    markCompleted(CheckoutFormStepEnum.ADDRESS);
    goToStep(CheckoutFormStepEnum.PAYMENT);
  };

  const needsShipping = cartData?.needsShipping ?? false;

  const isStepCompleted = (step: Step) => completedSteps.has(step);

  const hasNonPickupShippingRates = (cartData?.shippingRates ?? []).some(
    (pkg) =>
      pkg.shippingRates.some(
        (r) =>
          !r.rateId.includes("local_pickup") &&
          !r.rateId.includes("pickup_location"),
      ),
  );

  const showStep3 =
    needsShipping &&
    (formData.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT ||
      (formData.deliveryMethod === DeliveryStepEnum.SHIPPING_TO_HOME &&
        hasNonPickupShippingRates));

  const step3Title =
    formData.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT
      ? "Billing"
      : "Shipping Options";

  const getBriefValue = (step: Step): string => {
    switch (step) {
      case CheckoutFormStepEnum.CONTACT:
        return formData.email;
      case CheckoutFormStepEnum.DELIVERY_METHOD:
        if (formData.deliveryMethod === DeliveryStepEnum.SHIPPING_TO_HOME) {
          return formData.shippingAddress?.address1
            ? `${formData.shippingAddress.address1}, ${formData.shippingAddress.city ?? ""}`
            : "";
        }
        if (
          formData.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT &&
          formData.pickupLocationRateId
        ) {
          const loc = pickupLocations.find(
            (l) => l.shippingMethodId === formData.pickupLocationRateId,
          );
          return loc ? loc.name : formData.deliveryMethod;
        }
        return formData.deliveryMethod;
      case CheckoutFormStepEnum.ADDRESS:
        if (formData.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT) {
          return formData.billingAddress?.address1
            ? `${formData.billingAddress.address1}, ${formData.billingAddress.city ?? ""}`
            : "";
        }
        return formData.shippingRateName ?? "";
      default:
        return "";
    }
  };

  return (
    <>
      {/* Express/wallet checkout (Apple Pay / Google Pay / Link) — the single
          ExpressCheckoutElement instance, mounted at the top so a buyer can
          pay in one tap and skip the form. It self-hides when no wallet is
          available. Stripe allows only ONE per CheckoutProvider, so it must
          NOT also appear in the Payment step. Rendered from CheckoutSteps
          (not CheckoutForm) so its confirm-time dead-session path can reach
          handleSessionExpired (ENG-784). */}
      <ExpressCheckoutTop
        sessionId={sessionId}
        onSessionExpired={handleSessionExpired}
      />
      <div className="space-y-2">
        {/* Step 1: Contact */}
        <AccordionWrapper
          order={1}
          title="Contact"
          isActive={currentStep === CheckoutFormStepEnum.CONTACT}
          isCompleted={isStepCompleted(CheckoutFormStepEnum.CONTACT)}
          clickable={isStepCompleted(CheckoutFormStepEnum.CONTACT)}
          handleAccordionClick={() => goToStep(CheckoutFormStepEnum.CONTACT)}
          briefValue={getBriefValue(CheckoutFormStepEnum.CONTACT)}
        >
          <ContactFormStep
            enableStripe={true} // Stripe ContactDetailsElement (Checkout Sessions native) collects email + drives Link (ENG-748)
            onNext={handleContactNext}
            defaultValues={{
              email: formData.email,
              newsletter: formData.newsletter,
            }}
            buttonLabel="Continue to Delivery"
            emailMarketingEnabled={emailMarketingEnabled}
            {...(onRefreshSession && { onRefreshSession })}
          />
        </AccordionWrapper>

        {/* Step 2: Delivery method */}
        <AccordionWrapper
          order={2}
          title={needsShipping ? "Delivery" : "Address"}
          isActive={currentStep === CheckoutFormStepEnum.DELIVERY_METHOD}
          isCompleted={isStepCompleted(CheckoutFormStepEnum.DELIVERY_METHOD)}
          clickable={isStepCompleted(CheckoutFormStepEnum.DELIVERY_METHOD)}
          handleAccordionClick={() =>
            goToStep(CheckoutFormStepEnum.DELIVERY_METHOD)
          }
          briefValue={getBriefValue(CheckoutFormStepEnum.DELIVERY_METHOD)}
          disabled={
            !isStepCompleted(CheckoutFormStepEnum.CONTACT) &&
            currentStep !== CheckoutFormStepEnum.DELIVERY_METHOD
          }
        >
          {needsShipping ? (
            <DeliveryMethodStep
              enableStripe={true}
              onNext={(data) =>
                handleDeliveryNext({
                  deliveryMethod:
                    data.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT
                      ? DeliveryStepEnum.CLICK_AND_COLLECT
                      : DeliveryStepEnum.SHIPPING_TO_HOME,
                  ...(data.location != null ? { location: data.location } : {}),
                  ...(data.shippingAddress != null
                    ? { shippingAddress: data.shippingAddress }
                    : {}),
                })
              }
              defaultValues={{
                deliveryMethod: formData.deliveryMethod,
                location: formData.pickupLocationRateId ?? "",
                shippingAddress: formData.shippingAddress
                  ? {
                      firstName: formData.shippingAddress.firstName ?? "",
                      lastName: formData.shippingAddress.lastName ?? "",
                      line1: formData.shippingAddress.address1 ?? "",
                      line2: formData.shippingAddress.address2 ?? "",
                      city: formData.shippingAddress.city ?? "",
                      state: formData.shippingAddress.state ?? "",
                      country: formData.shippingAddress.country ?? "",
                      postalCode: formData.shippingAddress.postcode ?? "",
                      phone: formData.shippingAddress.phone ?? "",
                    }
                  : undefined,
              }}
              pickupLocations={pickupLocations}
              buttonLabel="Continue"
            />
          ) : (
            <BillingAddressStep
              enableStripe={true}
              onNext={handleBillingNext}
              defaultValues={
                formData.billingAddress
                  ? {
                      billingAddress: {
                        firstName: formData.billingAddress.firstName ?? "",
                        lastName: formData.billingAddress.lastName ?? "",
                        line1: formData.billingAddress.address1 ?? "",
                        ...(formData.billingAddress.address2
                          ? { line2: formData.billingAddress.address2 }
                          : {}),
                        city: formData.billingAddress.city ?? "",
                        state: formData.billingAddress.state ?? "",
                        country: formData.billingAddress.country ?? "",
                        postalCode: formData.billingAddress.postcode ?? "",
                        phone: formData.billingAddress.phone ?? "",
                      },
                    }
                  : undefined
              }
              buttonLabel="Continue to Payment"
            />
          )}
        </AccordionWrapper>

        {/* Step 3: Shipping options (Ship to Home) or Billing (Click & Collect) */}
        {showStep3 && (
          <AccordionWrapper
            order={3}
            title={step3Title}
            isActive={currentStep === CheckoutFormStepEnum.ADDRESS}
            isCompleted={isStepCompleted(CheckoutFormStepEnum.ADDRESS)}
            clickable={isStepCompleted(CheckoutFormStepEnum.ADDRESS)}
            handleAccordionClick={() => goToStep(CheckoutFormStepEnum.ADDRESS)}
            briefValue={getBriefValue(CheckoutFormStepEnum.ADDRESS)}
            disabled={
              !isStepCompleted(CheckoutFormStepEnum.DELIVERY_METHOD) &&
              currentStep !== CheckoutFormStepEnum.ADDRESS
            }
          >
            {formData.deliveryMethod === DeliveryStepEnum.CLICK_AND_COLLECT ? (
              <BillingAddressStep
                enableStripe={true}
                onNext={handleBillingNext}
                defaultValues={
                  formData.billingAddress
                    ? {
                        billingAddress: {
                          firstName: formData.billingAddress.firstName ?? "",
                          lastName: formData.billingAddress.lastName ?? "",
                          line1: formData.billingAddress.address1 ?? "",
                          ...(formData.billingAddress.address2
                            ? { line2: formData.billingAddress.address2 }
                            : {}),
                          city: formData.billingAddress.city ?? "",
                          state: formData.billingAddress.state ?? "",
                          country: formData.billingAddress.country ?? "",
                          postalCode: formData.billingAddress.postcode ?? "",
                          phone: formData.billingAddress.phone ?? "",
                        },
                      }
                    : undefined
                }
                buttonLabel="Continue to Payment"
              />
            ) : (
              <ShippingOptionsStep
                onNext={handleShippingOptionsNext}
                buttonLabel="Continue to Payment"
                sessionId={sessionId}
                {...(shippingOptionMapping?.length
                  ? { shippingOptionMapping }
                  : {})}
              />
            )}
          </AccordionWrapper>
        )}

        {/* Step 4: Payment */}
        <AccordionWrapper
          order={showStep3 ? 4 : 3}
          title="Payment"
          isActive={currentStep === CheckoutFormStepEnum.PAYMENT}
          isCompleted={isStepCompleted(CheckoutFormStepEnum.PAYMENT)}
          clickable={false}
          handleAccordionClick={() => {}}
          disabled={
            currentStep !== CheckoutFormStepEnum.PAYMENT &&
            !isStepCompleted(CheckoutFormStepEnum.PAYMENT)
          }
        >
          <StripePaymentStep
            showBillingSameAsShipping={
              needsShipping &&
              formData.deliveryMethod === DeliveryStepEnum.SHIPPING_TO_HOME
            }
            shippingAddress={formData.shippingAddress}
            sessionId={sessionId}
            onSessionExpired={handleSessionExpired}
          />
        </AccordionWrapper>
      </div>
    </>
  );
}

/** Registers checkout debug data into HeadKitDevTools without any UI. */
function CheckoutDebugRegistrar({ session }: { session: CheckoutSessionProp }) {
  const checkoutState = useCheckout();
  const { cartData } = useCartContext();
  useDebugRegister("Stripe Session", session);
  useDebugRegister("Checkout State", checkoutState);
  useDebugRegister("Cart", cartData);
  return null;
}

/**
 * Wraps the form and cart in CheckoutProvider so all child components
 * (including CouponBox in the cart sidebar) can access useCheckout() and
 * runServerUpdate. Session is created server-side and passed in as props —
 * the cart token is never read on the client (cookie is httpOnly).
 */
export function CheckoutForm({
  checkoutSession,
  cartSidebar,
  pickupLocationsFromApi = [],
  onRefreshSession,
  initialStep,
  initialEmail,
  isAuthenticated = false,
}: {
  checkoutSession: CheckoutSessionProp;
  cartSidebar: ReactNode;
  /** Pickup locations from API (with full address). Merged with cart rates for display. */
  pickupLocationsFromApi?: Array<{
    name: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    postcode: string;
    country: string;
    countryCode: string;
    shippingMethodId: string;
  }>;
  onRefreshSession?: (
    email: string,
    nextStep: string,
    opts?: { notice?: "cart_changed" },
  ) => Promise<void>;
  initialStep?: Step;
  initialEmail?: string;
  /**
   * True when the shopper is logged in (ENG-783). Gates the provider-level
   * `defaultValues.email` prefill: an authed session may carry a bound
   * email-ful customer, and the init-time prefill against it kills all
   * elements (IntegrationError → loaderror). See the gate at the
   * CheckoutElementsProvider options below.
   */
  isAuthenticated?: boolean;
}) {
  const [stripePromise, setStripePromise] = useState<ReturnType<
    typeof loadStripe
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ENG-801 (quick-260714-n0w): freeze the email prefill PER SESSION.
  // `defaultValues` is an INIT-time Stripe option, but react-stripe-js
  // re-runs its init effect whenever the options prop changes (inline object
  // = every render) and the LAST closure wins the loadStripe race. So a
  // post-mount flip of `initialEmail` — checkout-page-content clears
  // `restoredEmail` right after a recreate, falling back to the STALE
  // server-resolved customerEmail — would hand Stripe the OLD email, and the
  // element asserts it onto the recreated session (observed in QA: the order
  // carried the pre-edit email). Capture the prefill on the first render of
  // each sessionId and never let it drift for that session ("adjust state
  // during render" pattern).
  const [frozenPrefill, setFrozenPrefill] = useState<{
    sessionId: string;
    email: string | null;
  }>({
    sessionId: checkoutSession.sessionId,
    email: initialEmail?.trim() ? initialEmail : null,
  });
  if (frozenPrefill.sessionId !== checkoutSession.sessionId) {
    setFrozenPrefill({
      sessionId: checkoutSession.sessionId,
      email: initialEmail?.trim() ? initialEmail : null,
    });
  }
  const sessionPrefillEmail =
    frozenPrefill.sessionId === checkoutSession.sessionId
      ? frozenPrefill.email
      : (initialEmail ?? null);
  /** Mapping from sync; Stripe recreates shipping rate IDs when line items change. */
  const [syncShippingMapping, setSyncShippingMapping] = useState<Array<{
    rateId: string;
    stripeShippingRateId: string;
  }> | null>(null);

  // Reset sync mapping when session changes (e.g. recreate from contact email change).
  useEffect(() => {
    setSyncShippingMapping(null);
  }, [checkoutSession.sessionId]);

  const onSyncComplete = useCallback(
    (
      mapping: Array<{ rateId: string; stripeShippingRateId: string }> | null,
    ) => {
      setSyncShippingMapping(mapping);
    },
    [],
  );

  useEffect(() => {
    const stripeAccountId = checkoutSession.stripeAccountId ?? undefined;
    const stripePromise = loadStripe(checkoutSession.publishableKey, {
      ...(stripeAccountId ? { stripeAccount: stripeAccountId } : {}),
    });
    setStripePromise(stripePromise);
    stripePromise.catch(() => {
      setError("Failed to load payment provider. Please refresh the page.");
    });
  }, [checkoutSession.publishableKey, checkoutSession.stripeAccountId]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center py-16">
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-3 text-sm text-gray-500">
          Preparing your checkout…
        </span>
      </div>
    );
  }

  return (
    <CheckoutElementsProvider
      key={checkoutSession.sessionId}
      stripe={stripePromise}
      options={{
        adaptivePricing: {
          allowed: true,
        },
        clientSecret: checkoutSession.clientSecret,
        // ENG-801 (quick-260714-n0w): provider-level email prefill. Stripe's
        // custom-checkout best practice: `defaultValues.email` prefills the
        // ContactDetailsElement AND initiates Link auth, and stays MUTABLE
        // (unlike `customer_email` at create, which render-locks the field —
        // sessions are still created email-LESS). The provider mounts once
        // per session (keyed by sessionId above), so this covers (a) first
        // paint when the server resolved an email (page.tsx
        // `resolveCheckoutEmail` — the reload path carries the cart billing
        // email server-side) and (b) the recreate path (remount with
        // `restoredEmail`). Residual gap: an email that only arrives via the
        // ASYNC getFullCartAction fill inside CheckoutSteps AFTER provider
        // mount is missed here — the contact submit's update-email branch
        // and the bounded session-email push are the safety nets. Uses the
        // per-session FROZEN prefill (see `frozenPrefill` above) so option
        // drift can never feed Stripe a stale email. Spread conditionally:
        // the key is optional + exactOptionalPropertyTypes.
        // ENG-783 fix2: NEVER pass defaultValues.email for an AUTHED shopper.
        // `defaultValues.email` makes stripe.js internally call updateEmail at
        // element init; when the session was created with a bound customer
        // that has an email (logged-in reuse path) the API rejects it with
        // IntegrationError "You cannot update the email because a
        // `customer_email` or `customer` with an email is already set on the
        // Checkout Session." — and that rejection fans out as `loaderror` on
        // ALL elements and kills useCheckout (dead checkout). Empirical
        // harness proved defaultValues.email × customer-with-email is the
        // ONLY failing combination (bound customer alone loads fine). For
        // authed shoppers the prefill is also redundant: an email-ful bound
        // customer prefills the session's own email into the element; a
        // first-time authed session lets the shopper type into the element.
        // Guest prefill (restore-email flow, ENG-801) stays unchanged.
        ...(sessionPrefillEmail && !isAuthenticated
          ? { defaultValues: { email: sessionPrefillEmail } }
          : {}),
        elementsOptions: {
          appearance: {
            theme: "flat",
            variables: {
              borderRadius: "6px",
              focusBoxShadow: "none",
              colorPrimary: "#9572C0",
              colorBackground: "#FFFFFF",
              colorText: "#23102E",
              colorDanger: "#A81059",
              fontFamily: "urbanist, ui-sans-serif, system-ui, sans-serif",
              colorTextPlaceholder: "#76766B",
            },
            rules: {
              ".AccordionItem": {
                padding: "4px",
              },
              ".Input": {
                padding: "11px 10px",
                outline: "1px solid #9572C0",
              },
              ".Input:focus": {
                outline: "2px solid #7F54B3",
                backgroundColor: "#F9FFEB",
                fontWeight: "500",
              },
              ".Input.Input--invalid": {
                outline: "2px solid #E01577",
              },
            },
          },
        },
      }}
    >
      <CheckoutActionsProvider>
        <CheckoutDebugRegistrar session={checkoutSession} />
        <div className="px-[20px] md:px-[40px] mx-auto grid grid-cols-12 gap-[20px]">
          {/* Checkout form — left on desktop. The single ExpressCheckoutElement
              is rendered INSIDE CheckoutSteps (top of its output) so its
              dead-session recovery can reach handleSessionExpired (ENG-784). */}
          <div className="order-2 md:order-1 col-span-12 md:col-span-6">
            <CheckoutSteps
              sessionId={checkoutSession.sessionId}
              pickupLocationsFromApi={pickupLocationsFromApi}
              isAuthenticated={isAuthenticated}
              {...((
                syncShippingMapping ?? checkoutSession.shippingOptionMapping
              )?.length
                ? {
                    shippingOptionMapping:
                      syncShippingMapping ??
                      checkoutSession.shippingOptionMapping ??
                      [],
                  }
                : {})}
              onSyncComplete={onSyncComplete}
              {...(initialStep && { initialStep })}
              {...(sessionPrefillEmail && {
                initialEmail: sessionPrefillEmail,
              })}
              {...(onRefreshSession && { onRefreshSession })}
            />
          </div>
          {/* Cart sidebar — right on desktop, collapsible on mobile */}
          <div className="order-1 md:order-2 col-span-12 md:col-start-7 md:col-span-6 lg:col-start-8 lg:col-span-5">
            {cartSidebar}
          </div>
        </div>
      </CheckoutActionsProvider>
    </CheckoutElementsProvider>
  );
}
