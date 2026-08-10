import type { Metadata } from "next";
import Link from "next/link";

/**
 * /checkout/finalising — the holding page for a legacy V1 payment return.
 *
 * REDIRECTED HERE BY: `app/api/checkout/confirm/route.ts` (GET, 303). That
 * route is the V1 → V2 migration safety net: V1 storefronts created the
 * WooCommerce order inside `GET /api/checkout/confirm` *after* Stripe
 * succeeded, so a shopper still at their bank for 3D Secure when a store
 * migrated is returned to that url on the V2 origin. Without this page the
 * redirect would land nowhere.
 *
 * DO NOT DELETE AS UNREFERENCED. Nothing in the storefront links here — the
 * only entry point is that redirect, and greping for `/checkout/finalising`
 * finds the route handler's constant, not an anchor.
 *
 * LAST RESORT BY CONSTRUCTION. It renders with NO data read of any kind: no
 * SDK call, no branding fetch, no `fetch`. It must still serve when the
 * catalogue backend, WordPress or the gateway are all unreachable, because the
 * situation that brings a shopper here is precisely a cutover going sideways.
 * Do not add a data read, and do not add a cache directive that could pin it.
 *
 * IT SHOWS NO FIGURES. No order number, no amount, no payment identifier. The
 * page can verify none of them — the order is finalised asynchronously from the
 * Stripe webhook — and showing an unverified number to a shopper holding a
 * charged card is worse than showing none (T-15.1-09-04).
 */

export const metadata: Metadata = {
  title: "Finalising your order",
  // Never indexable: it is a transient payment-return surface, and an indexed
  // copy would send strangers to a page implying they had just paid
  // (T-15.1-09-05).
  robots: { index: false, follow: false },
};

export default function CheckoutFinalisingPage() {
  return (
    <div className="px-5 py-10 md:px-10 md:py-14">
      <div className="max-w-md">
        <h1 className="mb-4 text-3xl md:text-4xl">Payment received</h1>

        <p className="mb-4 text-base leading-normal">
          Your payment went through. We are finalising your order now, and a
          confirmation will follow by email shortly.
        </p>

        <p className="text-base leading-normal">
          If no confirmation arrives, please{" "}
          <Link href="/contact" className="underline">
            contact us
          </Link>{" "}
          and we will sort it out for you.
        </p>
      </div>
    </div>
  );
}
