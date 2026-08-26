export default function CheckoutLoading() {
  // Keep this minimal: Shopify carts redirect to hosted checkoutUrl and must
  // not flash the Stripe accordion skeleton. WooCommerce still paints the
  // real checkout once SSR finishes.
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg">
      <p className="text-sm text-muted-foreground">Continuing to checkout…</p>
    </div>
  );
}
