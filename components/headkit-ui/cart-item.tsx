"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon, XIcon } from "@/components/icon";
import { cn, decodeHtmlEntities, getFloatVal, formatPrice } from "@/lib/utils";
import {
  getCartAction,
  removeCartItemAction,
  updateCartItemAction,
} from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { useIsQuoteMode } from "@/components/checkout/checkout-mode-provider";
import { GiftCardDetails } from "@/components/checkout/gift-card-details";
import { AddonDetails } from "@/components/checkout/addon-details";
import type { CartFieldsFragment } from "@headkit/sdk";

type CartItem = CartFieldsFragment["items"][number];

interface CartItemProps {
  item: CartItem;
  currency: { code: string };
  removeable?: boolean;
  onCartUpdate: (cart: CartFieldsFragment) => void;
}

export function CartItemRow({
  item,
  currency,
  removeable = true,
  onCartUpdate,
}: CartItemProps) {
  const [quantity, setQuantity] = useState(item.quantity);
  const {
    toggleCart,
    isPending: loading,
    optimisticRemoveItem,
    optimisticUpdateQuantity,
    startCartTransition,
  } = useCartContext();
  const isQuoteMode = useIsQuoteMode();

  useEffect(() => {
    setQuantity(item.quantity);
  }, [item.quantity]);

  const isOnSale =
    item.prices.price !== "" &&
    item.prices.regularPrice !== "" &&
    getFloatVal(item.prices.price) < getFloatVal(item.prices.regularPrice);

  const isOutOfStock = item.stockStatus?.toLowerCase() === "outofstock";
  const isOnBackorder = item.stockStatus?.toLowerCase() === "onbackorder";
  const isAtStockLimit =
    !isOnBackorder &&
    item.stockQuantity != null &&
    quantity >= item.stockQuantity;

  const handleRemove = () => {
    startCartTransition(async () => {
      optimisticRemoveItem(item.key);
      const result = await removeCartItemAction(item.key);
      if (result.success) {
        // Commit server cart (including empty) so badge/drawer refresh when the
        // last line item is removed.
        onCartUpdate(result.cart);
        return;
      }
      const cart = await getCartAction();
      if (cart) onCartUpdate(cart);
    });
  };

  const handleDecrement = async () => {
    if (quantity === 1) {
      handleRemove();
      return;
    }
    const updated = quantity - 1;
    setQuantity(updated);
    startCartTransition(async () => {
      optimisticUpdateQuantity(item.key, updated);
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        onCartUpdate(result.cart);
        return;
      }
      const cart = await getCartAction();
      if (cart) onCartUpdate(cart);
      else setQuantity(item.quantity);
    });
  };

  const handleIncrement = async () => {
    const updated = quantity + 1;
    setQuantity(updated);
    startCartTransition(async () => {
      optimisticUpdateQuantity(item.key, updated);
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        onCartUpdate(result.cart);
        return;
      }
      const cart = await getCartAction();
      if (cart) onCartUpdate(cart);
      else setQuantity(item.quantity);
    });
  };

  const displayName = decodeHtmlEntities(item.name);
  const imageSrc = item.images[0]?.src ?? "/assets/HeadKit-Fallback.png";
  const imageAlt = decodeHtmlEntities(item.images[0]?.alt ?? item.name);
  const productHref = item.slug ? `/products/${item.slug}` : null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-3">
        {/* Product image */}
        {productHref ? (
          <InstantLink
            href={productHref}
            onClick={() => toggleCart(false)}
            className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-[3px] bg-white"
          >
            <Image
              src={imageSrc}
              fill
              className="absolute left-0 top-0 h-full w-full object-contain"
              alt={imageAlt}
              quality={50}
              sizes="100px"
            />
          </InstantLink>
        ) : (
          <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-[3px] bg-white">
            <Image
              src={imageSrc}
              fill
              className="absolute left-0 top-0 h-full w-full object-contain"
              alt={imageAlt}
              quality={50}
              sizes="100px"
            />
          </div>
        )}

        {/* Product info */}
        <div className="flex min-w-0 flex-1 flex-col justify-between px-2 md:px-5">
          <div>
            {productHref ? (
              <InstantLink
                href={productHref}
                pendingVariant="text"
                onClick={() => toggleCart(false)}
                className="line-clamp-2 font-semibold capitalize text-[#343A40] hover:underline"
              >
                {displayName}
              </InstantLink>
            ) : (
              <p className="line-clamp-2 font-semibold capitalize text-[#343A40]">
                {displayName}
              </p>
            )}
            {item.variation.length > 0 && (
              <div className="mt-0.5 flex flex-wrap leading-[22px]">
                {item.variation.map((v, i) => (
                  <p
                    key={v.attribute}
                    className="text-sm capitalize text-[#343A40]"
                  >
                    {i > 0 && <span className="px-1">/</span>}
                    {decodeHtmlEntities(v.value)}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="mt-0.5 flex items-center gap-3">
            <button
              type="button"
              className={cn(
                "flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 shadow-none outline-none ring-0 appearance-none focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                loading && "cursor-not-allowed opacity-40",
              )}
              onClick={handleDecrement}
              disabled={loading}
              aria-label="Decrease quantity"
            >
              <MinusIcon className="h-4 w-4 text-primary" />
            </button>
            <span className="min-w-6 text-center font-medium text-primary tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              className={cn(
                "flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 shadow-none outline-none ring-0 appearance-none hover:opacity-70 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                (loading || isAtStockLimit || isOutOfStock) &&
                  "cursor-not-allowed opacity-40",
              )}
              onClick={handleIncrement}
              disabled={loading || isAtStockLimit || isOutOfStock}
              aria-label="Increase quantity"
            >
              <PlusIcon className="h-4 w-4 text-primary" />
            </button>
          </div>
        </div>

        {/* Price + remove */}
        <div className="flex shrink-0 flex-col items-end justify-between">
          {!isQuoteMode && (
            <div className="flex flex-col items-end">
              {isOnSale && (
                <p className="font-medium line-through">
                  {formatPrice(
                    getFloatVal(item.prices.regularPrice) * quantity,
                    currency.code,
                  )}
                </p>
              )}
              <p className={cn("font-medium", isOnSale && "text-pink-600")}>
                {formatPrice(
                  getFloatVal(item.totals.lineSubtotal),
                  currency.code,
                )}
              </p>
            </div>
          )}

          {removeable && (
            <button
              type="button"
              onClick={handleRemove}
              className={cn(
                // p-3/-m-3 grows the tap target to ~40px (WCAG/HIG) without
                // shifting the 16px icon's visual position (F8).
                "-m-3 cursor-pointer border-none bg-transparent p-3 shadow-none outline-none ring-0 appearance-none hover:opacity-70 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                loading && "cursor-not-allowed opacity-40",
                isQuoteMode && "mt-auto",
              )}
              disabled={loading}
              aria-label="Remove item"
            >
              <XIcon className="h-4 w-4 text-pink-500" />
            </button>
          )}
        </div>
      </div>

      {item.giftCard && <GiftCardDetails giftCard={item.giftCard} />}
      {/* Gift card first, add-ons second: a line can legitimately carry both,
          and this leaves the element order of a gift-card-only line untouched.
          The guard is a length test, not a null guard — the schema types
          `addons` as a non-null list with an empty default (D-14.1-04), so
          optional chaining here would assert a contract the schema forbids.
          AddonDetails also returns null for an empty list; the guard is here
          because "no add-ons means no element" should be legible at the mount
          point, which is where a reader looks. */}
      {item.addons.length > 0 && <AddonDetails addons={item.addons} />}
    </div>
  );
}
