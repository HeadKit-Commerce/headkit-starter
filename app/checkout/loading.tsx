export default function CheckoutLoading() {
  // Keep this minimal: Shopify carts redirect to hosted checkoutUrl and must
  // not flash the Stripe accordion skeleton. WooCommerce still paints the
  // real checkout once SSR finishes.
  //
  // `min-h-screen` HERE IS DELIBERATE AND IS NOT THE ONE THAT WAS REMOVED FROM
  // page.tsx. This file is a single centred sentence, and `min-h-screen` is
  // what gives `items-center` a box to centre it in — drop it and the message
  // pins to the top of the window. page.tsx's copy was a wrapper around real
  // content, where the same class only manufactured empty space below it. The
  // two files share no geometry (this one paints no step card and no summary),
  // so there is nothing here to keep "in step" with that change.
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg">
      <p className="text-sm text-muted-foreground">Continuing to checkout…</p>
    </div>
  );
}
