"use client";

import dynamic from "next/dynamic";

/**
 * Client-only cart drawer. Keeps `next/dynamic({ ssr: false })` out of the
 * root Server Component layout (Next.js forbids that combination).
 */
const CartDrawer = dynamic(
  () =>
    import("@/components/headkit-ui/cart-drawer").then((mod) => mod.CartDrawer),
  { ssr: false },
);

export function LazyCartDrawer(): React.JSX.Element {
  return <CartDrawer />;
}
