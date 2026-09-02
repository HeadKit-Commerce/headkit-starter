"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { XIcon } from "@/components/icon";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import {
  getCartAction,
  removeCartItemAction,
  updateCartItemAction,
} from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { QuantityStepper } from "@/components/headkit-ui/quantity-stepper";
import { stripTitleMarkers } from "@/lib/title-emphasis";
import {
  GiftCardDetails,
  type GiftCardDisplay,
} from "@/components/checkout/gift-card-details";

export type QuoteLineItem = {
  key: string;
  name: string;
  slug?: string | null;
  quantity: number;
  stockStatus?: string | null;
  stockQuantity?: number | null;
  images: Array<{ src?: string | null; alt?: string | null }>;
  variation?: Array<{ attribute: string; value: string }>;
  giftCard?: GiftCardDisplay | null;
};

type QuoteCartItemProps = {
  item: QuoteLineItem;
  showQuantityControls: boolean;
};

function QuoteCartItem({
  item,
  showQuantityControls,
}: QuoteCartItemProps): React.ReactElement {
  const [quantity, setQuantity] = useState(item.quantity);
  const {
    setCartData,
    toggleCart,
    isPending: loading,
    optimisticRemoveItem,
    optimisticUpdateQuantity,
    startCartTransition,
  } = useCartContext();

  useEffect(() => {
    setQuantity(item.quantity);
  }, [item.quantity]);

  const isOutOfStock = item.stockStatus?.toLowerCase() === "outofstock";
  const isOnBackorder = item.stockStatus?.toLowerCase() === "onbackorder";
  const maxStock =
    !isOnBackorder && item.stockQuantity != null ? item.stockQuantity : null;

  const commitQuantity = (updated: number): void => {
    setQuantity(updated);
    startCartTransition(async () => {
      optimisticUpdateQuantity(item.key, updated);
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        setCartData(result.cart);
        return;
      }
      const cart = await getCartAction();
      if (cart) setCartData(cart);
      else setQuantity(item.quantity);
    });
  };

  const handleRemove = (): void => {
    startCartTransition(async () => {
      optimisticRemoveItem(item.key);
      const result = await removeCartItemAction(item.key);
      if (result.success) {
        setCartData(result.cart);
        return;
      }
      const cart = await getCartAction();
      if (cart) setCartData(cart);
    });
  };

  const displayName = stripTitleMarkers(decodeHtmlEntities(item.name));
  const imageSrc = item.images[0]?.src ?? "/assets/HeadKit-Fallback.png";
  const imageAlt = stripTitleMarkers(
    decodeHtmlEntities(item.images[0]?.alt ?? item.name),
  );
  // The cart fragment selects a slug and no permalink, so this is one of the
  // two storefront surfaces that cannot build the canonical `/shop/{cat…}/{slug}`
  // path (`lib/canonical-path.ts`) — it 308s on click instead.
  //
  // What keeps that out of the consolidation is the EMPTY CART, not robots.txt
  // and not "this is a client component". `/quote` IS a real route and it is NOT
  // disallowed (see `app/robots.ts`, which lists `/account`, `/checkout`, `/api`
  // and `/search` and no cart or quote path), and `app/quote/page.tsx` is a
  // SERVER component that awaits `getFullCartAction()` and hands the cart to
  // `QuoteCheckout`, which Next server-renders — so a request that DOES carry a
  // cart cookie puts these hrefs into server-rendered HTML today.
  //
  // The actual mechanism is that an anonymous crawler carries no cart session,
  // so the cart is empty, `app/quote/page.tsx` short-circuits to `<QuoteEmpty />`
  // and this component never renders an item at all. (Contrast the cart drawer,
  // which has a second and stronger protection: `lazy-cart-drawer.tsx` loads it
  // via `dynamic(..., { ssr: false })`, so it never server-renders. The quote
  // summary has only the empty-cart short-circuit.)
  //
  // Anything that server-renders a POPULATED cart or quote summary therefore
  // puts `/products/<slug>` links into crawlable HTML and must switch to
  // `productPath` first. Closing the gap properly means adding `permalink` to
  // the cart items selection, which is an SDK/schema change.
  const productHref = item.slug ? `/products/${item.slug}` : null;
  const variation = item.variation ?? [];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-4 md:gap-5">
        {productHref ? (
          <InstantLink
            href={productHref}
            onClick={() => toggleCart(false)}
            className="relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[3px] bg-white md:h-[140px] md:w-[140px]"
          >
            <Image
              src={imageSrc}
              fill
              className="absolute left-0 top-0 h-full w-full object-contain"
              alt={imageAlt}
              quality={50}
              sizes="140px"
            />
          </InstantLink>
        ) : (
          <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[3px] bg-white md:h-[140px] md:w-[140px]">
            <Image
              src={imageSrc}
              fill
              className="absolute left-0 top-0 h-full w-full object-contain"
              alt={imageAlt}
              quality={50}
              sizes="140px"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            {productHref ? (
              <InstantLink
                href={productHref}
                pendingVariant="text"
                onClick={() => toggleCart(false)}
                className="line-clamp-2 text-base font-semibold capitalize text-[#343A40] hover:underline md:text-lg"
              >
                {displayName}
              </InstantLink>
            ) : (
              <p className="line-clamp-2 text-base font-semibold capitalize text-[#343A40] md:text-lg">
                {displayName}
              </p>
            )}
            {variation.length > 0 && (
              <div className="mt-1 flex flex-wrap text-sm text-[#343A40]/70">
                {variation.map((v, i) => (
                  <span key={v.attribute}>
                    {i > 0 && <span className="px-1">/</span>}
                    {decodeHtmlEntities(v.value)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {showQuantityControls ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <QuantityStepper
                value={quantity}
                min={1}
                max={isOutOfStock ? quantity : maxStock}
                disabled={loading || isOutOfStock}
                onChange={commitQuantity}
                onDecrement={() => commitQuantity(Math.max(1, quantity - 1))}
                onIncrement={() => {
                  const next = quantity + 1;
                  commitQuantity(
                    maxStock != null ? Math.min(maxStock, next) : next,
                  );
                }}
              />

              <button
                type="button"
                onClick={handleRemove}
                className={cn(
                  "relative z-10 -m-3 cursor-pointer border-none bg-transparent p-3 shadow-none outline-none ring-0 appearance-none hover:opacity-70 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                  loading && "cursor-not-allowed opacity-40",
                )}
                disabled={loading}
                aria-label="Remove item"
              >
                <XIcon className="h-4 w-4 text-pink-500" />
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#343A40]/70">Qty {quantity}</p>
          )}
        </div>
      </div>

      {item.giftCard ? <GiftCardDetails giftCard={item.giftCard} /> : null}
    </div>
  );
}

export type QuoteCartItemsProps = {
  items: QuoteLineItem[];
  /** When true, show PDP-style qty controls (checkout). Confirmation leaves this off. */
  showQuantityControls?: boolean;
};

/**
 * Quote line items — image plate only (no card chrome), matching cart/PLP tiles.
 */
export function QuoteCartItems({
  items,
  showQuantityControls = false,
}: QuoteCartItemsProps): React.ReactElement {
  return (
    <div className="space-y-5">
      {items.map((item) => (
        <QuoteCartItem
          key={item.key}
          item={item}
          showQuantityControls={showQuantityControls}
        />
      ))}
    </div>
  );
}
