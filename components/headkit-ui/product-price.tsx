"use client";

import { useIsQuoteMode } from "@/components/checkout/checkout-mode-provider";
import { cn, formatPrice } from "@/lib/utils";
import { getPriceDisplay } from "@/lib/price-display";

interface Props {
  price: string;
  regularPrice?: string;
  onSale: boolean;
  dark?: boolean;
  size?: "default" | "big";
  /**
   * When set in quote mode, show this body copy instead of hiding the price
   * (used on the product detail page).
   */
  quoteMessage?: string;
  className?: string;
}

const ProductPrice = ({
  price,
  regularPrice,
  onSale,
  dark = false,
  size = "default",
  quoteMessage,
  className,
}: Props) => {
  const isQuoteMode = useIsQuoteMode();

  if (isQuoteMode) {
    if (quoteMessage) {
      return (
        <p
          className={cn(
            "font-normal leading-5 text-primary",
            size === "big" ? "text-lg" : "text-base",
            className,
          )}
        >
          {quoteMessage}
        </p>
      );
    }
    return null;
  }

  // Display logic (incl. when a strikethrough is warranted) lives in
  // lib/price-display.ts — a strikethrough renders ONLY for a genuine
  // discount (known regular price > current price), never as a fallback.
  const { min, max, struck } = getPriceDisplay({ price, regularPrice, onSale });

  const current =
    max !== null
      ? `${formatPrice(min)} – ${formatPrice(max)}`
      : formatPrice(min);

  const sizeClass = size === "big" ? "text-lg" : "text-base";

  return (
    <div className={cn("flex gap-3 font-semibold", className)}>
      {struck !== null && (
        <p
          className={cn(
            "leading-4 line-through",
            sizeClass,
            dark ? "text-white" : "text-black",
          )}
        >
          {formatPrice(struck)}
        </p>
      )}
      <p
        className={cn(
          "leading-4",
          sizeClass,
          struck !== null
            ? // pink-600 (#d6187b), not pink-500 — the theme's pink-500 fails
              // WCAG AA on white; contrast-computed step from the a11y sweep.
              "text-pink-600"
            : dark
              ? "text-white"
              : "text-black",
        )}
      >
        {current}
      </p>
    </div>
  );
};

export { ProductPrice };
