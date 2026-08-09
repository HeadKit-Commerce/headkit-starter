"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { MinusIcon, PlusIcon, XIcon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { removeCartItemAction, updateCartItemAction } from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
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
  const [loading, startTransition] = useTransition();
  const { setCartData, toggleCart } = useCartContext();

  useEffect(() => {
    setQuantity(item.quantity);
  }, [item.quantity]);

  const isOutOfStock = item.stockStatus?.toLowerCase() === "outofstock";
  const isOnBackorder = item.stockStatus?.toLowerCase() === "onbackorder";
  const isAtStockLimit =
    !isOnBackorder &&
    item.stockQuantity != null &&
    quantity >= item.stockQuantity;

  const handleRemove = (): void => {
    startTransition(async () => {
      const result = await removeCartItemAction(item.key);
      if (result.success) {
        setCartData(result.cart);
      }
    });
  };

  const handleDecrement = (): void => {
    if (quantity === 1) {
      handleRemove();
      return;
    }
    const updated = quantity - 1;
    setQuantity(updated);
    startTransition(async () => {
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        setCartData(result.cart);
      }
    });
  };

  const handleIncrement = (): void => {
    const updated = quantity + 1;
    setQuantity(updated);
    startTransition(async () => {
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        setCartData(result.cart);
      }
    });
  };

  const imageSrc = item.images[0]?.src ?? "/assets/HeadKit-Fallback.png";
  const imageAlt = item.images[0]?.alt ?? item.name;
  const productHref = item.slug ? `/products/${item.slug}` : null;
  const variation = item.variation ?? [];

  return (
    <div className="rounded-md border border-[#e5e5e5] bg-white p-4 md:p-5">
      <div className="flex gap-4 md:gap-5">
        {productHref ? (
          <Link
            href={productHref}
            onClick={() => toggleCart(false)}
            className="relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[3px] bg-brand-bg md:h-[140px] md:w-[140px]"
          >
            <Image
              src={imageSrc}
              fill
              className="absolute left-0 top-0 h-full w-full object-contain"
              alt={imageAlt}
              quality={50}
              sizes="140px"
            />
          </Link>
        ) : (
          <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[3px] bg-brand-bg md:h-[140px] md:w-[140px]">
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
              <Link
                href={productHref}
                onClick={() => toggleCart(false)}
                className="line-clamp-2 text-base font-semibold capitalize text-[#343A40] hover:underline md:text-lg"
              >
                {item.name}
              </Link>
            ) : (
              <p className="line-clamp-2 text-base font-semibold capitalize text-[#343A40] md:text-lg">
                {item.name}
              </p>
            )}
            {variation.length > 0 && (
              <div className="mt-1 flex flex-wrap text-sm text-[#343A40]/70">
                {variation.map((v, i) => (
                  <span key={v.attribute}>
                    {i > 0 && <span className="px-1">/</span>}
                    {v.value}
                  </span>
                ))}
              </div>
            )}
          </div>

          {showQuantityControls ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-9 cursor-pointer items-center justify-center border-none bg-transparent p-0 shadow-none outline-none ring-0 appearance-none focus:outline-none focus-visible:outline-none focus-visible:ring-0",
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
                    "flex h-9 w-9 cursor-pointer items-center justify-center border-none bg-transparent p-0 shadow-none outline-none ring-0 appearance-none hover:opacity-70 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
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

              <button
                type="button"
                onClick={handleRemove}
                className={cn(
                  "-m-3 cursor-pointer border-none bg-transparent p-3 shadow-none outline-none ring-0 appearance-none hover:opacity-70 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
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
  /** When true, show +/- qty controls (checkout). Confirmation leaves this off. */
  showQuantityControls?: boolean;
};

/**
 * Larger product tiles for Quote checkout / confirmation.
 */
export function QuoteCartItems({
  items,
  showQuantityControls = false,
}: QuoteCartItemsProps): React.ReactElement {
  return (
    <div className="space-y-4">
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
