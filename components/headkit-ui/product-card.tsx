"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Fragment, useEffect, useState } from "react";
import type {
  ProductSummaryFieldsFragment,
  ProductAttribute,
} from "@headkit/sdk";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import { productUrl } from "@/lib/convert-uri";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { ProductPrice } from "@/components/headkit-ui/product-price";
import { BadgeList } from "@/components/headkit-ui/badge-list";
import { VariantSwatch } from "@/components/headkit-ui/variant-swatch";
import { getVariationCardPrice } from "@/lib/price-display";

const isVariableProduct = (product: ProductSummaryFieldsFragment): boolean =>
  product?.type?.toUpperCase() === "VARIABLE";

/** Max colour swatches shown on a card before collapsing into a "+N" chip (F4). */
const MAX_CARD_SWATCHES = 4;

/** Instant Navigation pending cue — must render as a child of `<Link>`. */
function LinkPendingOverlay(): React.JSX.Element | null {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-brand-bg/40"
    />
  );
}

interface Props {
  product: ProductSummaryFieldsFragment;
  className?: string;
  dark?: boolean;
  mobileCol?: boolean;
  isNew?: boolean;
  /** Eager-load the card image (first-row cards where it may be the LCP). */
  priority?: boolean;
  /**
   * Heading level for the product name. The correct level depends on where the
   * card sits, and this component is used at two different depths:
   *
   *   - PLP / search results: the card follows the page `h1` directly, so the
   *     name must be `h2` — `h3` there skips a level (WCAG heading-order).
   *   - Homepage carousels: the card sits under a section `h2`, so `h3` is
   *     correct and `h2` would duplicate the section heading's level.
   *
   * Hardcoding either one is wrong on the other surface — that is exactly how
   * this regressed twice (#58 set h2 for PLP, #102 set h3 for carousels, each
   * breaking the other). The caller knows its own depth, so it decides.
   *
   * Defaults to `h3`, the nested case, so a caller that has not thought about
   * it cannot silently claim top-level significance.
   */
  titleAs?: "h2" | "h3";
}

export const ProductCard = ({
  product,
  className,
  dark = false,
  mobileCol = false,
  isNew = false,
  priority = false,
  titleAs: TitleTag = "h3",
}: Props) => {
  const [colourSelected, setColourSelected] = useState<string | null>(null);
  const [imageSelected, setImageSelected] = useState<string>(
    product?.image?.src ?? "",
  );
  const [uri, setUri] = useState<string>(productUrl(product?.slug ?? ""));

  useEffect(() => {
    if (!product) return;

    setUri(productUrl(product.slug));

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
      const colorAttr = selectedVariation.attributes.find(
        (attr) => attr.key === "pa_color" || attr.key === "pa_colour",
      );
      setUri(productUrl(product.slug, colorAttr?.value));
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
    return getVariationCardPrice({
      variations: product.variations ?? [],
      fallbackPrice: product?.price,
      fallbackRegularPrice: product?.regularPrice,
    });
  };

  const { price: displayPrice, regularPrice: displayRegularPrice } =
    getDisplayPrice();

  if (!product) return null;

  return (
    <div className={cn("relative w-full", className)}>
      <div className="absolute left-2 top-2 z-10">
        <BadgeList isSale={product?.onSale ?? false} isNewIn={isNew} />
      </div>
      {/*
        prefetch={true}: with Partial Prefetching, default links only pull the
        route App Shell. Opt into per-URL prefetch so `'use cache'` PDP data
        can resolve before click (Next.js 16.3 Instant Navigations).
      */}
      <Link
        href={uri}
        prefetch={true}
        aria-label="Featured Image"
        className="relative block"
      >
        <LinkPendingOverlay />
        <FeaturedImage
          src={imageSelected}
          alt={product?.name ?? "Product"}
          priority={priority}
          fit="contain"
        />
      </Link>
      <div className="pt-3">
        <div
          className={cn(
            // Title/price share a row only from lg: — at md (3-col grid,
            // ~230px cards) the shrink-0 price squeezed titles to ~100px,
            // truncating mid-word and stacking swatches one per row (F11).
            "flex flex-col gap-1 lg:flex-row lg:justify-between lg:gap-2",
            mobileCol && "flex-col",
          )}
        >
          <div className="min-w-0">
            <Link
              href={uri}
              prefetch={true}
              className="relative cursor-pointer"
            >
              <LinkPendingOverlay />
              {/* Level comes from `titleAs` — see the prop docs. Visual size is
                  class-driven and identical at either level. */}
              <TitleTag
                className={cn(
                  "text-[17px] font-semibold text-primary line-clamp-2 break-words",
                  dark && "text-white",
                )}
              >
                {decodeHtmlEntities(product?.name ?? "")}
              </TitleTag>
            </Link>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {isVariableProduct(product) &&
                product.attributes.map((attribute: ProductAttribute) => {
                  if (
                    attribute.slug !== "pa_colour" &&
                    attribute.slug !== "pa_color"
                  )
                    return null;
                  const options = attribute.fullOptions ?? [];
                  const visible = options.slice(0, MAX_CARD_SWATCHES);
                  const extra = options.length - visible.length;
                  return (
                    <Fragment key={attribute.slug}>
                      {visible.map((option, i) => (
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
                      ))}
                      {extra > 0 && (
                        <Link
                          href={uri}
                          className="text-xs font-medium leading-4 text-gray-800 hover:text-primary"
                          aria-label={`${extra} more colours`}
                        >
                          +{extra}
                        </Link>
                      )}
                    </Fragment>
                  );
                })}
            </div>
          </div>

          <div className="flex justify-between shrink-0">
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
