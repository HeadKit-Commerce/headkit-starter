// `@stripe/stripe-js`'s DEFAULT entry injects the Stripe.js <script> as a side
// effect of module import — `src/index.ts` ends with a top-level
// `Promise.resolve().then(() => getStripePromise())`, so the tag is in the DOM
// one microtask after this module evaluates, whether or not `loadStripe()` is
// ever called. `/pure` is Stripe's own documented export that does not.
//
// That is why this import is load-bearing rather than cosmetic. On a product
// page the only reason Stripe.js is present at all is the BNPL badge
// (`components/stripe/payment-messaging.tsx`), which defers its own load behind
// an `IntersectionObserver` — and under the default entry that gate was inert:
// the script arrived regardless, and so did the `m` third-party cookie. With
// `/pure` the observer becomes real, and the store setting that hides the badge
// genuinely stops the load, because it gates the render and the render is now
// what triggers the load.
//
// The type-only `Stripe` import below stays on the root entry deliberately —
// `/pure` publishes no types beyond `loadStripe`/`ReleaseTrain`, and a type
// import is erased, so it carries no side effect.
//
// `lib/stripe-js-singleton.test.ts` sweeps `app`, `components`, `lib` and
// `hooks` for a value-level import of the root entry, because one anywhere in
// the client graph puts the script back on every route that reaches it.
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";
import { env } from "@/lib/env";

type StripeLoadOptions = NonNullable<Parameters<typeof loadStripe>[1]>;

// Stripe's advanced fraud signals stay ON unless a store opts out, because ON
// is Stripe's own default and therefore what every storefront does today.
//
// Turning them off removes the `m` third-party cookie on `m.stripe.com` and is
// worth real Lighthouse Best Practices points, but it IS DOCUMENT-WIDE AND
// REACHES CHECKOUT: both Stripe entries share one DOM and `injectScript` only
// runs when no matching tag exists (its matcher accepts a query string), so
// whichever entry loads the script first decides the setting for the whole
// document. A client-side navigation from a product page to /checkout keeps the
// same document and carries the setting with it. Stripe states the cost — doing
// so "increases their risk of fraud, especially card testing" — while Radar,
// 3DS2 device data and the events logged when a customer interacts with
// Stripe-managed checkout fields are explicitly unaffected.
//
// That makes it a per-merchant risk-appetite call, not a platform default, so
// it is reached through `NEXT_PUBLIC_STRIPE_ADVANCED_FRAUD_SIGNALS="false"` per
// store and nothing else.
//
// Applied ONCE, immediately before the first `loadStripe`, never at module
// scope: `setLoadParameters` THROWS after `loadStripe` has run ("You cannot
// change load parameters after calling loadStripe", `src/pure.ts`), so the
// ordering is load-bearing — but reading `env` at module scope would make every
// module that transitively imports this one require a fully populated
// environment just to be imported. It touches no DOM and is safe during SSR.
let loadParametersApplied = false;

function applyLoadParametersOnce(): void {
  if (loadParametersApplied) return;
  loadParametersApplied = true;
  if (env.NEXT_PUBLIC_STRIPE_ADVANCED_FRAUD_SIGNALS === "false") {
    loadStripe.setLoadParameters({ advancedFraudSignals: false });
  }
}

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
 *
 * With the `/pure` entry above, the FIRST call to this function is also what
 * puts Stripe.js on the wire. Every consumer already calls it explicitly
 * (`app/checkout/CheckoutForm.tsx`, `components/stripe/payment-messaging.tsx`);
 * nothing in the app relied on the old import side effect.
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

  applyLoadParametersOnce();
  const promise = loadStripe(publishableKey, options);
  stripePromises.set(key, promise);
  return promise;
}

/** Test-only: reset the module cache between unit tests. */
export function resetStripePromiseCacheForTests(): void {
  stripePromises.clear();
}
