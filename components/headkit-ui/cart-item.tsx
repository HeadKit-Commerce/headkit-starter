"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { MinusIcon, PlusIcon, XIcon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { getFloatVal, formatPrice } from "@/lib/utils";
import { removeCartItemAction, updateCartItemAction } from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
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
  const [loading, startTransition] = useTransition();
  const { toggleCart } = useCartContext();

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
    startTransition(async () => {
      const result = await removeCartItemAction(item.key);
      if (result.success) {
        onCartUpdate(result.cart);
      }
    });
  };

  const handleDecrement = async () => {
    if (quantity === 1) {
      handleRemove();
      return;
    }
    const updated = quantity - 1;
    setQuantity(updated);
    startTransition(async () => {
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        onCartUpdate(result.cart);
      }
    });
  };

  const handleIncrement = async () => {
    const updated = quantity + 1;
    setQuantity(updated);
    startTransition(async () => {
      const result = await updateCartItemAction(item.key, updated);
      if (result.success) {
        onCartUpdate(result.cart);
      }
    });
  };

  const imageSrc = item.images[0]?.src ?? "/assets/fallback-image.webp";
  const imageAlt = item.images[0]?.alt ?? item.name;
  const productHref = item.slug ? `/shop/${item.slug}` : null;

  return (
    <div className="flex gap-3">
      {/* Product image */}
      {productHref ? (
        <Link
          href={productHref}
          onClick={() => toggleCart(false)}
          className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-[3px]"
        >
          <Image
            src={imageSrc}
            fill
            className="absolute left-0 top-0 h-full w-full object-cover"
            alt={imageAlt}
            quality={50}
            sizes="100px"
          />
        </Link>
      ) : (
        <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-[3px]">
          <Image
            src={imageSrc}
            fill
            className="absolute left-0 top-0 h-full w-full object-cover"
            alt={imageAlt}
            quality={50}
            sizes="100px"
          />
        </div>
      )}

      {/* Product info */}
      <div className="flex flex-1 flex-col justify-between px-2 md:px-5">
        <div>
          {productHref ? (
            <Link
              href={productHref}
              onClick={() => toggleCart(false)}
              className="font-semibold capitalize text-[#343A40] hover:underline"
            >
              {item.name}
            </Link>
          ) : (
            <p className="font-semibold capitalize text-[#343A40]">
              {item.name}
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
                  {v.value}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="mt-0.5 flex items-center">
          <button
            className={cn(
              "flex h-[26px] w-[26px] items-center justify-center rounded-l-[3px] bg-purple-500",
              loading && "cursor-not-allowed opacity-40",
            )}
            onClick={handleDecrement}
            disabled={loading}
            aria-label="Decrease quantity"
          >
            <MinusIcon className="h-3 w-3 stroke-white stroke-2" />
          </button>
          <span className="flex h-[26px] w-[26px] items-center justify-center border-b border-t border-gray-500 bg-white pt-[2px] font-medium text-purple-800">
            {quantity}
          </span>
          <button
            className={cn(
              "flex h-[26px] w-[26px] items-center justify-center rounded-r-[3px] bg-purple-500 hover:bg-pink-500",
              (loading || isAtStockLimit || isOutOfStock) &&
                "cursor-not-allowed opacity-40",
            )}
            onClick={handleIncrement}
            disabled={loading || isAtStockLimit || isOutOfStock}
            aria-label="Increase quantity"
          >
            <PlusIcon className="h-3 w-3 stroke-white stroke-2" />
          </button>
        </div>
      </div>

      {/* Price + remove */}
      <div className="flex flex-col items-end justify-between">
        <div className="flex flex-col items-end">
          {isOnSale && (
            <p className="font-medium line-through">
              {formatPrice(
                getFloatVal(item.prices.regularPrice) * quantity,
                currency.code,
              )}
            </p>
          )}
          <p className={cn("font-medium", isOnSale && "text-pink-500")}>
            {formatPrice(getFloatVal(item.totals.lineSubtotal), currency.code)}
          </p>
        </div>

        {removeable && (
          <button
            onClick={handleRemove}
            className={cn(
              "cursor-pointer hover:opacity-80",
              loading && "cursor-not-allowed opacity-40",
            )}
            disabled={loading}
            aria-label="Remove item"
          >
            <XIcon className="h-4 w-4 bg-transparent stroke-pink-500 stroke-2" />
          </button>
        )}
      </div>
    </div>
  );
}
