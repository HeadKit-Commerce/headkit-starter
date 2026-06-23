"use server";

import { getCartToken } from "@/lib/cart";
import { createServerHeadkit } from "@/lib/sdk.server";
import type {
  ProcessCheckoutInput,
  ProcessCheckoutOrderInput,
  ProcessCheckoutMutation,
  CreateCheckoutSessionMutation,
  GetCheckoutSessionQuery,
  GetStoreOrderQuery,
  UpdateCustomerInput,
  CartFieldsFragment,
} from "@headkit/sdk";

/**
 * Checkout mutations and queries. All checkout operations from the frontend
 * should go through these server actions (not API routes). Flow: Client →
 * Server Action → SDK → GraphQL Gateway.
 */

export type CheckoutSessionResult =
  CreateCheckoutSessionMutation["commerce"]["createCheckoutSession"];

export type CheckoutSessionDetails =
  GetCheckoutSessionQuery["commerce"]["checkoutSession"];

export type CheckoutOrder =
  ProcessCheckoutMutation["commerce"]["processCheckout"];

export type StoreOrder = NonNullable<
  GetStoreOrderQuery["commerce"]["storeOrder"]
>;

/**
 * Creates a Stripe Checkout Session (custom UI mode) for the current cart.
 * Resolves cart token from cookies. Returns the client secret to initialise
 * CheckoutProvider on the frontend.
 * When successBaseUrl is provided, backend builds order-based return URL:
 * {successBaseUrl}/checkout/success/{orderId}?key={orderKey}&session_id={CHECKOUT_SESSION_ID}
 * Runs server-side — the secret key never reaches the browser.
 */
export async function createCheckoutSessionAction(
  returnUrl: string,
  customerEmail?: string,
  customerId?: string,
  allowedShippingCountries?: string[],
  successBaseUrl?: string,
): Promise<CheckoutSessionResult> {
  const cartToken = await getCartToken();
  if (!cartToken) throw new Error("No active cart session.");
  // Only request Stripe shipping-address collection when the caller passes
  // allowedShippingCountries (i.e. the cart needs shipping). Passing a non-empty
  // list makes Stripe set shipping_address_collection, which REQUIRES a shipping
  // address to confirm(). For digital/no-shipping carts the caller passes an empty
  // array (or omits it) so the session does not require a shipping address that the
  // billing-only UI never sets. Empty array => omit the field entirely.
  const shippingCountries = allowedShippingCountries ?? [];
  return createServerHeadkit(cartToken).payments.createCheckoutSession({
    returnUrl,
    ...(shippingCountries.length > 0
      ? { allowedShippingCountries: shippingCountries }
      : {}),
    ...(customerId ? { customer: customerId } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(successBaseUrl ? { successBaseUrl } : {}),
  });
}

/**
 * Retrieves a Stripe Checkout Session by ID.
 * Returns payment status, session status, and the billing/shipping address collected by Stripe.
 * Runs server-side — the secret key never reaches the browser.
 */
export async function getCheckoutSessionAction(
  sessionId: string,
): Promise<CheckoutSessionDetails> {
  return createServerHeadkit().payments.getCheckoutSession(sessionId);
}

/**
 * Updates the customer billing/shipping address on the cart.
 * Triggers WooCommerce to recalculate shipping rates.
 */
export async function updateCustomerAction(
  input: UpdateCustomerInput,
): Promise<CartFieldsFragment> {
  const cartToken = await getCartToken();
  if (!cartToken) throw new Error("No active cart session.");
  return createServerHeadkit(cartToken).cart.updateCustomer(input);
}

/**
 * Selects a shipping rate for a given package.
 * Updates the cart totals accordingly.
 */
export async function selectShippingRateAction(
  packageId: string,
  rateId: string,
): Promise<CartFieldsFragment> {
  const cartToken = await getCartToken();
  if (!cartToken) throw new Error("No active cart session.");
  return createServerHeadkit(cartToken).cart.selectShipping(packageId, rateId);
}

/**
 * Syncs an existing Stripe Checkout Session's line items with the current
 * WooCommerce cart totals. Resolves cart token from cookies.
 *
 * Call this after any server-side cart mutation that affects pricing
 * (address update → shipping rates, shipping rate selection) so the Stripe
 * session reflects authoritative amounts before the customer pays.
 */
export async function syncCheckoutSessionLineItemsAction(
  sessionId: string,
): Promise<void> {
  const cartToken = await getCartToken();
  if (!cartToken) throw new Error("No active cart session.");
  await createServerHeadkit(cartToken).payments.syncCheckoutSessionLineItems(
    sessionId,
  );
}

/**
 * Finalises checkout after Stripe payment confirmation.
 * Resolves cart token from cookies. Runs server-side so totals are
 * re-validated before order creation.
 */
export async function processCheckoutAction(
  input: ProcessCheckoutInput,
): Promise<CheckoutOrder> {
  const cartToken = await getCartToken();
  if (!cartToken) throw new Error("No active cart session.");
  return createServerHeadkit(cartToken).checkout.process(input);
}

/**
 * Processes an existing draft order with payment (WooCommerce Checkout Order API).
 * Uses cart token from session metadata. Call when orderId, orderKey, cartToken are present.
 */
export async function processCheckoutOrderAction(
  cartToken: string,
  orderId: string,
  orderKey: string,
  input: ProcessCheckoutOrderInput,
): Promise<CheckoutOrder> {
  return createServerHeadkit(cartToken).checkout.processCheckoutOrder(
    orderId,
    input,
  );
}

/**
 * Fetches a placed order by WooCommerce order ID and order key.
 * billingEmail is required for guest orders (WooCommerce Store API).
 * Used on the success page to display full order details.
 */
export async function getOrderAction(
  orderId: string,
  orderKey: string,
  billingEmail?: string | null,
): Promise<StoreOrder | null> {
  return createServerHeadkit().checkout.getOrder(
    orderId,
    orderKey,
    billingEmail,
  );
}
