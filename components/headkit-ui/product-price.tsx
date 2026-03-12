import { cn, formatPrice, getFloatVal } from "@/lib/utils";

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
  // Handle price ranges like "10 - 20"
  const splitPrice = price?.split("-");
  const minPrice = splitPrice?.[0]?.trim() ?? "";
  const maxPrice = splitPrice?.[1]?.trim() ?? null;

  // First price shown: regular price (will have line-through when on sale),
  // or the full range if a range is provided.
  const displayFirst = maxPrice
    ? `${formatPrice(getFloatVal(minPrice))} – ${formatPrice(getFloatVal(maxPrice))}`
    : formatPrice(getFloatVal(regularPrice || minPrice || "0"));

  // Sale price shown in pink when on sale
  const displaySale = maxPrice
    ? `${formatPrice(getFloatVal(minPrice))} – ${formatPrice(getFloatVal(maxPrice))}`
    : formatPrice(getFloatVal(minPrice));

  const sizeClass = size === "big" ? "text-lg" : "text-base";

  return (
    <div className="flex gap-3 font-semibold">
      <p
        className={cn(
          "leading-4",
          sizeClass,
          onSale ? "line-through" : "",
          dark ? "text-white" : "text-black",
        )}
      >
        {displayFirst}
      </p>
      {onSale && (
        <p className={cn("leading-4 text-pink-500", sizeClass)}>
          {displaySale}
        </p>
      )}
    </div>
  );
};

export { ProductPrice };
