import { cn, formatPrice } from "@/lib/utils";
import { getPriceDisplay } from "@/lib/price-display";

interface Props {
  price: string;
  regularPrice?: string;
  onSale: boolean;
  dark?: boolean;
  size?: "default" | "big";
}

const ProductPrice = ({
  price,
  regularPrice,
  onSale,
  dark = false,
  size = "default",
}: Props) => {
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
    <div className="flex gap-3 font-semibold">
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
