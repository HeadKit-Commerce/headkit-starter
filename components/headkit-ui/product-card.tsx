"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ProductSummaryFieldsFragment,
  ProductAttribute,
} from "@headkit/sdk";
import { cn } from "@/lib/utils";
import { convertToRelativePath } from "@/lib/convert-uri";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { ProductPrice } from "@/components/headkit-ui/product-price";
import { BadgeList } from "@/components/headkit-ui/badge-list";
import { VariantSwatch } from "@/components/headkit-ui/variant-swatch";

const isVariableProduct = (product: ProductSummaryFieldsFragment): boolean =>
  product?.type?.toUpperCase() === "VARIABLE";

interface Props {
  product: ProductSummaryFieldsFragment;
  className?: string;
  dark?: boolean;
  mobileCol?: boolean;
  isNew?: boolean;
}

export const ProductCard = ({
  product,
  className,
  dark = false,
  mobileCol = false,
  isNew = false,
}: Props) => {
  const [colourSelected, setColourSelected] = useState<string | null>(null);
  const [imageSelected, setImageSelected] = useState<string>(
    product?.image?.src ?? "",
  );
  const [uri, setUri] = useState<string>(convertToRelativePath(product?.uri));

  useEffect(() => {
    if (!product) return;

    setUri(convertToRelativePath(product.uri));

    if (isVariableProduct(product)) {
      const colourAttr = product.attributes.find(
        (a: ProductAttribute) =>
          a.slug === "pa_colour" || a.slug === "pa_color",
      );
      if (product.attributes.length === 1 && !colourAttr) {
        setImageSelected(product.variations?.[0]?.image?.src ?? "");
      } else {
        setColourSelected(colourAttr?.fullOptions?.[0]?.slug ?? null);
      }
    } else {
      setImageSelected(product.image?.src ?? "");
    }
  }, [product]);

  useEffect(() => {
    if (!product || !isVariableProduct(product)) return;

    const selectedVariation = product.variations.find((variation) =>
      variation.attributes.some((attr) => colourSelected === attr.value),
    );

    if (selectedVariation) {
      const params = selectedVariation.attributes
        .filter((attr) => attr.key !== "pa_size")
        .map(
          (attr) =>
            `${encodeURIComponent(attr.key)}=${encodeURIComponent(attr.value)}`,
        )
        .join("&");
      setUri(`${convertToRelativePath(product.uri)}?${params}`);
      setImageSelected(selectedVariation.image?.src ?? "");
    }
  }, [colourSelected, product]);

  const getDisplayPrice = () => {
    if (!isVariableProduct(product)) {
      return {
        price: product?.price ?? "",
        regularPrice: product?.regularPrice ?? "",
      };
    }
    const variations = product.variations ?? [];
    if (variations.length === 0) {
      return {
        price: product?.price ?? "0",
        regularPrice: product?.regularPrice ?? "0",
      };
    }
    const prices = variations
      .map((v) => parseFloat(v?.price ?? "0"))
      .filter((p) => p > 0);
    if (prices.length === 0) return { price: "0", regularPrice: "0" };
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (minPrice === maxPrice)
      return { price: minPrice.toString(), regularPrice: "" };
    return { price: `${minPrice} - ${maxPrice}`, regularPrice: "" };
  };

  const { price: displayPrice, regularPrice: displayRegularPrice } =
    getDisplayPrice();

  if (!product) return null;

  return (
    <div className={cn("relative w-full", className)}>
      <div className="absolute left-2 top-2 z-10">
        <BadgeList isSale={product?.onSale ?? false} isNewIn={isNew} />
      </div>
      <Link href={uri} aria-label="Featured Image">
        <FeaturedImage src={imageSelected} alt={product?.name ?? "Product"} />
      </Link>
      <div className="pt-3">
        <div className={cn("flex justify-between", mobileCol && "flex-col")}>
          <div>
            <Link href={uri}>
              <h3 className={cn("font-semibold", dark && "text-white")}>
                {product?.name}
              </h3>
            </Link>
            <div className="flex items-center gap-2">
              {isVariableProduct(product) &&
                product.attributes.map(
                  (attribute: ProductAttribute) =>
                    (attribute.slug === "pa_colour" ||
                      attribute.slug === "pa_color") &&
                    attribute.fullOptions?.map((option, i) => (
                      <Link
                        href={uri}
                        key={i}
                        onMouseEnter={() =>
                          setColourSelected(option?.slug ?? null)
                        }
                      >
                        <VariantSwatch
                          isUnavailable={false}
                          label={option?.name ?? ""}
                          value={option?.slug ?? ""}
                          onClick={() =>
                            setColourSelected(option?.slug ?? null)
                          }
                          selectedOptionValue={colourSelected ?? ""}
                          color1={option?.swatchColor ?? ""}
                          color2={option?.swatchColor2 ?? ""}
                          size="small"
                        />
                      </Link>
                    )),
                )}
            </div>
          </div>

          <div className="flex justify-between">
            <ProductPrice
              price={displayPrice}
              regularPrice={displayRegularPrice}
              onSale={product?.onSale ?? false}
              dark={dark}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
