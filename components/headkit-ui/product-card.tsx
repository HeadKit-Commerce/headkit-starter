"use client";

import { InstantLink } from "@/components/headkit-ui/instant-link";
import { Fragment, useEffect, useState } from "react";
import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import { productPath } from "@/lib/canonical-path";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { ProductPrice } from "@/components/headkit-ui/product-price";
import { BadgeList } from "@/components/headkit-ui/badge-list";
import { VariantSwatch } from "@/components/headkit-ui/variant-swatch";
import { getVariationCardPrice } from "@/lib/price-display";
import { findSwatchAttribute } from "@/lib/swatch-attribute";
import { useCatalogDisplay } from "@/components/headkit-ui/catalog-display-provider";
import type { CatalogProduct } from "@/lib/catalog-display";
import { TitleEmphasis } from "@/components/headkit-ui/title-emphasis";
import { productBadgesFromTags } from "@/lib/product-badges";
import { stripTitleMarkers } from "@/lib/title-emphasis";
import { getStoreTheme } from "@/lib/store-theme";

const isVariableProduct = (product: ProductSummaryFieldsFragment): boolean =>
  product?.type?.toUpperCase() === "VARIABLE";

/** Max colour swatches shown on a card before collapsing into a "+N" chip. */
const MAX_CARD_SWATCHES = 10;

function colourAttribute(product: ProductSummaryFieldsFragment) {
  return findSwatchAttribute(product.attributes);
}

interface Props {
  product: CatalogProduct;
  className?: string;
  dark?: boolean;
  mobileCol?: boolean;
  isNew?: boolean;
  /** Eager-load the card image (first-row cards where it may be the LCP). */
  priority?: boolean;
  /**
   * Heading level for the product name. The correct level depends on where the
   * card sits:
   *
   *   - PLP / search / carousels: the card sits under a section `h2` (visible
   *     on carousels; `sr-only` "Products" on the collection grid), so `h3`.
   *   - Wishlist: the card follows the page `h1` directly, so `h2`.
   *
   * Defaults to `h3`, the nested case.
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
  const { showSwatches, imageRollover } = useCatalogDisplay();
  const lockedColour = product.colorwaySlug ?? null;

  const [colourSelected, setColourSelected] = useState<string | null>(() => {
    if (lockedColour) return lockedColour;
    if (!product || !isVariableProduct(product)) return null;
    return colourAttribute(product)?.fullOptions?.[0]?.slug ?? null;
  });
  const [imageSelected, setImageSelected] = useState<string>(() => {
    if (!product) return "";
    if (!isVariableProduct(product)) return product.image?.src ?? "";
    const colourAttr = colourAttribute(product);
    if (product.attributes.length === 1 && !colourAttr) {
      return product.variations?.[0]?.image?.src ?? "";
    }
    return product.image?.src ?? "";
  });
  const [isHovering, setIsHovering] = useState(false);

  // The one canonical path, resolved from the product's own permalink — the
  // same string the canonical tag, the sitemap and the Product JSON-LD emit.
  // Building `/products/{slug}` here is what pointed every card, on every
  // surface, at the shape the store did NOT have indexed.
  const href = productPath(product, lockedColour ?? colourSelected);

  const selectedVariationForHover =
    isVariableProduct(product) && colourSelected
      ? product.variations.find((variation) =>
          variation.attributes.some((attr) => colourSelected === attr.value),
        )
      : undefined;
  // Prefer the second variation gallery image; parent hoverImage applies to
  // simple cards and non-exploded swatch cards. Exploded colourway cards
  // already resolved hoverImage in catalog-display (colourway images[1],
  // then parent hover if it is not another colourway's primary). Do not
  // re-scan variations — that reintroduces the first-card stolen-hover bug.
  const hoverSrc = imageRollover
    ? lockedColour
      ? (product.hoverImage?.src ?? null)
      : (selectedVariationForHover?.images?.[1]?.src ??
        product.hoverImage?.src ??
        null)
    : null;

  useEffect(() => {
    if (!product) return;

    if (lockedColour) {
      setColourSelected(lockedColour);
      return;
    }

    if (isVariableProduct(product)) {
      const colourAttr = colourAttribute(product);
      if (product.attributes.length === 1 && !colourAttr) {
        setColourSelected(null);
        setImageSelected(product.variations?.[0]?.image?.src ?? "");
      } else {
        setColourSelected(colourAttr?.fullOptions?.[0]?.slug ?? null);
      }
    } else {
      setColourSelected(null);
      setImageSelected(product.image?.src ?? "");
    }
  }, [product, lockedColour]);

  useEffect(() => {
    if (!product || !isVariableProduct(product)) return;

    const selectedVariation = product.variations.find((variation) =>
      variation.attributes.some((attr) => colourSelected === attr.value),
    );

    if (selectedVariation) {
      setImageSelected(selectedVariation.image?.src ?? "");
    } else if (product.image?.src) {
      setImageSelected(product.image.src);
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

  const isNewIn = isNew || Boolean(product?.isNew);
  const customBadges = productBadgesFromTags(
    product.tags,
    getStoreTheme().catalog?.badgeTags,
    { hideNew: isNewIn, hideSale: product?.onSale ?? false },
  );
  const plainName = stripTitleMarkers(
    decodeHtmlEntities(product?.name ?? "Product"),
  );

  return (
    <div className={cn("headkit-product-card relative w-full", className)}>
      <div className="absolute left-2 top-2 z-10">
        <BadgeList
          isSale={product?.onSale ?? false}
          // Prefer explicit prop; fall back to product.isNew so collection grids
          // show New without every caller passing the prop.
          isNewIn={isNewIn}
          badges={customBadges}
        />
      </div>
      {/*
        InstantLink + prefetch={true}: Partial Prefetching warms PDP `'use cache'`
        data before click (Next.js 16.3 Instant Navigations).
      */}
      <InstantLink
        href={href}
        aria-label="Featured Image"
        className="block"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <FeaturedImage
          src={imageSelected}
          hoverSrc={hoverSrc}
          showHover={isHovering}
          alt={plainName}
          priority={priority}
          fit="contain"
        />
      </InstantLink>
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
            <InstantLink href={href} pendingVariant="text">
              {/* Level comes from `titleAs` — see the prop docs. Visual size is
                  class-driven and identical at either level. */}
              <TitleTag
                className={cn(
                  "text-[17px] text-primary line-clamp-2 break-words",
                  dark && "text-white",
                )}
              >
                <TitleEmphasis
                  text={product?.name ?? ""}
                  highlight={titleAs === "h2"}
                />
              </TitleTag>
            </InstantLink>
            <div className="flex min-w-0 flex-wrap items-center gap-2 py-1.5">
              {showSwatches &&
                isVariableProduct(product) &&
                product.attributes.map((attribute) => {
                  if (!findSwatchAttribute([attribute])) return null;
                  const options = attribute.fullOptions ?? [];
                  const visible = options.slice(0, MAX_CARD_SWATCHES);
                  const extra = options.length - visible.length;
                  return (
                    <Fragment key={attribute.slug}>
                      {visible.map((option) => {
                        const optionSlug = option?.slug ?? "";
                        const swatchHref = productPath(
                          product,
                          optionSlug || undefined,
                        );
                        return (
                          <InstantLink
                            href={swatchHref}
                            key={optionSlug || option?.name}
                            pendingVariant="text"
                            onMouseEnter={() =>
                              setColourSelected(optionSlug || null)
                            }
                          >
                            <VariantSwatch
                              isUnavailable={false}
                              label={option?.name ?? ""}
                              value={optionSlug}
                              onClick={() =>
                                setColourSelected(optionSlug || null)
                              }
                              selectedOptionValue={colourSelected ?? ""}
                              color1={option?.swatchColor ?? ""}
                              color2={option?.swatchColor2 ?? ""}
                              imageSrc={option?.swatchImage ?? ""}
                              size="small"
                            />
                          </InstantLink>
                        );
                      })}
                      {extra > 0 && (
                        <InstantLink
                          href={href}
                          pendingVariant="text"
                          className="text-xs font-medium leading-4 text-gray-800 hover:text-primary"
                          aria-label={`${extra} more colours`}
                        >
                          +{extra}
                        </InstantLink>
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
