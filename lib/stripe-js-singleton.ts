import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeLoadOptions = NonNullable<Parameters<typeof loadStripe>[1]>;

/** Cache key: publishable key + optional Connect account id. */
function cacheKey(publishableKey: string, stripeAccountId?: string): string {
  return stripeAccountId
    ? `${publishableKey}::${stripeAccountId}`
    : publishableKey;
}

const stripePromises = new Map<string, Promise<Stripe | null>>();

/**
 * Return a shared Stripe.js instance for the given publishable key (and optional
 * Connect account). Stripe recommends one constructor per user session when the
 * key is the same — multiple `loadStripe` calls trigger their optimization
 * warning and can slow Payment Element / wallet rendering.
 */
export function getStripePromise(
  publishableKey: string,
  options?: StripeLoadOptions,
): Promise<Stripe | null> {
  const stripeAccountId = options?.stripeAccount;
  const key = cacheKey(publishableKey, stripeAccountId);

  const existing = stripePromises.get(key);
  if (existing) {
    return existing;
  }

  const promise = loadStripe(publishableKey, options);
  stripePromises.set(key, promise);
  return promise;
}

/** Test-only: reset the module cache between unit tests. */
export function resetStripePromiseCacheForTests(): void {
  stripePromises.clear();
}
