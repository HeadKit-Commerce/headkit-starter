"use client";

import Image from "next/image";
import { formatPrice, decodeHtmlEntities } from "@/lib/utils";
import { stripTitleMarkers } from "@/lib/title-emphasis";
import {
  GiftCardDetails,
  type GiftCardDisplay,
} from "@/components/checkout/gift-card-details";
import {
  AddonDetails,
  type AddonDisplay,
} from "@/components/checkout/addon-details";

export type { GiftCardDisplay, AddonDisplay };

export interface LineItemDisplayProps {
  name: string;
  images: Array<{ src?: string | null; alt?: string | null }>;
  variation?: Array<{ attribute: string; value: string }>;
  quantity: number;
  /**
   * The line's shopper-facing total, tax INCLUSIVE, already resolved to a
   * number.
   *
   * A number and not the raw `totals.lineSubtotal` string it used to be: every
   * WooCommerce Store API total is tax-exclusive with the tax in a sibling
   * field, so a caller that hands this component a single raw total has already
   * lost the tax by the time the component sees it. Passing the resolved figure
   * forces each call site through {@link lineDisplayTotal}, which owns the
   * addition and the order pages' fallback chain.
   */
  lineTotal: number;
  currency: string;
  giftCard?: GiftCardDisplay | null;
  /**
   * The shopper's Product Add-Ons selections for this line. Typed as a plain
   * list rather than a nullable one because the schema guarantees
   * `[CartItemAddonSelection!]!` with an empty default (D-14.1-04) — a line
   * that has no add-ons carries `[]`, never null. The default below exists for
   * the one caller that has no line item at all to read from.
   */
  addons?: readonly AddonDisplay[];
  /**
   * Omit the line total.
   *
   * Separate from {@link hideAddonPrices} because the two are genuinely
   * independent: a surface can want one without the other, and a single flag
   * driving both silently strips the line prices from any caller that only
   * wanted the add-on suffixes gone.
   *
   * REQUIRED, like the provider `source` on `lineDisplayTotal`: an optional
   * flag defaulting to "show the money" lets a future call site reintroduce a
   * price leak by omission.
   */
  hideLineTotal: boolean;
  /**
   * Omit each add-on option's price suffix, keeping the option names and
   * values. A quote still echoes what the shopper configured (PAO-03); it just
   * carries no money.
   *
   * REQUIRED for the same reason as {@link hideLineTotal}.
   */
  hideAddonPrices: boolean;
}

export function LineItemDisplay({
  name,
  images,
  variation = [],
  quantity,
  lineTotal,
  currency,
  giftCard = null,
  addons = [],
  hideLineTotal,
  hideAddonPrices,
}: LineItemDisplayProps) {
  const displayName = stripTitleMarkers(decodeHtmlEntities(name));
  const imageSrc = images[0]?.src ?? "/assets/HeadKit-Fallback.png";
  const imageAlt = stripTitleMarkers(
    decodeHtmlEntities(images[0]?.alt ?? name),
  );

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

        {/* `min-w-0` is load-bearing, not cosmetic. A flex child defaults to
            `min-width: auto`, which refuses to shrink below its content width —
            and the title below is `truncate` (`white-space: nowrap`), so its
            min-content width is the WHOLE product name. Without `min-w-0` this
            column therefore never yields, `truncate` never engages, and the
            `shrink-0` price beside it is pushed off the right edge of the
            viewport: measured 91px of horizontal page overflow at 768px on a
            48-character product name, present from ~790px up to 1024px. The
            sibling line-item surfaces (`headkit-ui/cart-item.tsx`,
            `quote/quote-cart-items.tsx`, `headkit-ui/product-multi-add.tsx`)
            already carry it; this row was the one that did not. */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <p className="font-medium text-sm capitalize text-gray-900 truncate">
            {displayName}
          </p>
          {variation.length > 0 && (
            <div className="flex flex-wrap text-xs text-gray-500">
              {variation.map((v, i) => (
                <span key={v.attribute}>
                  {i > 0 && <span className="px-1">/</span>}
                  {decodeHtmlEntities(v.value)}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">Qty {quantity}</p>
        </div>

        {!hideLineTotal && (
          <div className="shrink-0 text-sm font-medium text-gray-900">
            {formatPrice(lineTotal, currency)}
          </div>
        )}
      </div>

      {giftCard && <GiftCardDetails giftCard={giftCard} />}
      {/* Gift card first, add-ons second: a line can legitimately carry both,
          and this keeps the existing element order untouched for every line
          that carries only a gift card. The guard is a length test, not a null
          guard — `addons` is a non-null list with an empty default
          (D-14.1-04). */}
      {addons.length > 0 && (
        <AddonDetails
          addons={addons}
          currency={currency}
          hidePrice={hideAddonPrices}
        />
      )}
    </div>
  );
}
