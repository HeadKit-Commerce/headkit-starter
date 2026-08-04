"use client";

import Image from "next/image";
import { getFloatVal, formatPrice } from "@/lib/utils";
import {
  GiftCardDetails,
  type GiftCardDisplay,
} from "@/components/checkout/gift-card-details";

export type { GiftCardDisplay };

export interface LineItemDisplayProps {
  name: string;
  images: Array<{ src?: string | null; alt?: string | null }>;
  variation?: Array<{ attribute: string; value: string }>;
  quantity: number;
  lineSubtotal: string;
  currency: string;
  giftCard?: GiftCardDisplay | null;
}

export function LineItemDisplay({
  name,
  images,
  variation = [],
  quantity,
  lineSubtotal,
  currency,
  giftCard = null,
}: LineItemDisplayProps) {
  const imageSrc = images[0]?.src ?? "/assets/HeadKit-Fallback.png";
  const imageAlt = images[0]?.alt ?? name;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-3">
        <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[3px] bg-white">
          <Image
            src={imageSrc}
            fill
            className="absolute left-0 top-0 h-full w-full object-contain"
            alt={imageAlt}
            quality={50}
            sizes="60px"
          />
        </div>

        <div className="flex flex-1 flex-col justify-between">
          <p className="font-medium text-sm capitalize text-gray-900 truncate">
            {name}
          </p>
          {variation.length > 0 && (
            <div className="flex flex-wrap text-xs text-gray-500">
              {variation.map((v, i) => (
                <span key={v.attribute}>
                  {i > 0 && <span className="px-1">/</span>}
                  {v.value}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">Qty {quantity}</p>
        </div>

        <div className="shrink-0 text-sm font-medium text-gray-900">
          {formatPrice(getFloatVal(lineSubtotal), currency)}
        </div>
      </div>

      {giftCard && <GiftCardDetails giftCard={giftCard} />}
    </div>
  );
}
