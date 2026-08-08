"use client";

import {
  useMemo,
  useState,
  useTransition,
  useCallback,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import type {
  Product,
  ProductFieldsFragment,
  ProductVariation,
} from "@headkit/sdk";
import { ProductImageGallery } from "@/components/headkit-ui/product-image-gallery";
import { ProductPrice } from "@/components/headkit-ui/product-price";
import { pickFirstPrice } from "@/lib/price-display";
import { VariantSwatch } from "@/components/headkit-ui/variant-swatch";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";
import { Button } from "@/components/ui/button";
import { MinusIcon, PlusIcon, HeartIcon } from "@/components/icon";
import { addToCartAction } from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { useIsQuoteMode } from "@/components/checkout/checkout-mode-provider";
import { cn, decodeHtmlEntities, formatWooRichText } from "@/lib/utils";
import { isInWishlist, toggleWishlist } from "@/lib/wishlist";
import type { GiftCardFormValues } from "@/components/gift-card-form";
import { DeliveryType } from "@/components/gift-card-delivery-type";
import { ProductEnquiry } from "@/components/headkit-ui/product-enquiry";
import { isColorAttrSlug } from "@/components/headkit-ui/collection/utils";
import { buildEnquiryInitialValues } from "@/lib/enquiry-form-values";
import { findSwatchAttribute } from "@/lib/swatch-attribute";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Lazy: gift-card-form drags react-hook-form + zod (~63 KB transfer) into the
// PDP bundle, but only gift-card products render it (RC-1 perf fix).
const GiftCardForm = lazy(() =>
  import("@/components/gift-card-form").then((m) => ({
    default: m.GiftCardForm,
  })),
);

type StorefrontProduct = ProductFieldsFragment | Product;

interface Props {
  product: StorefrontProduct;
  initialSearchParams?: Record<string, string>;
  /**
   * Kept for callers / agent reference — not rendered on the storefront.
   * BreadcrumbList JSON-LD is emitted separately for bots.
   */
  breadcrumbItems?: { name: string; uri: string; current: boolean }[];
  /** Color slug from URL path segment — enables path-based routing mode */
  initialColor?: string;
  /** Base path for the product, e.g. "/products/shirt" — triggers path-based routing */
  productBasePath?: string;
  /** Slot for dynamic stock rendering (e.g. PPR Suspense boundary). Replaces inline AvailabilityStatus. */
  stockSlot?: ReactNode;
}

const VARIABLE = "VARIABLE";

/**
 * Gravity Forms form id for the PDP product-enquiry form.
 *
 * Assign the right form in WordPress:
 * 1. Create (or keep) a GF form titled "Product Enquiry".
 * 2. Add visible fields (Name, Email, Message) plus HIDDEN fields labelled
 *    exactly: Product Name, Product URL, Product Size, Product Colour
 *    (snakeCase of those labels → product_name / product_url / …).
 * 3. Set this constant to that form's numeric id (local seed creates id 3 —
 *    see docker/wordpress/seed-gravity-forms.php).
 *
 * ProductEnquiry renders nothing when the form can't load, so a wrong id is a
 * silent no-op rather than a broken Enquire button.
 */
const ENQUIRY_FORM_ID = "3";

export function ProductDetail({
  product,
  initialSearchParams,
  initialColor,
  productBasePath,
  stockSlot,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [addingToCart, startTransition] = useTransition();
  const [cartFeedback, setCartFeedback] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [quantity, setQuantity] = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [showStickyAtc, setShowStickyAtc] = useState(false);
  const atcSectionRef = useRef<HTMLDivElement>(null);
  const { cartData, setCartData, toggleCart } = useCartContext();
  const isQuoteMode = useIsQuoteMode();

  useEffect(() => {
    setWishlisted(isInWishlist(product.id));
  }, [product.id]);

  const isVariable = product.type?.toUpperCase() === VARIABLE;
  const isGiftCard = product.isGiftCard === true;
  const [giftCardValues, setGiftCardValues] =
    useState<GiftCardFormValues | null>(null);
  const [isGiftCardFormValid, setIsGiftCardFormValid] = useState(false);

  const variationAttributes = useMemo(
    () => product.attributes.filter((a) => a.variation),
    [product.attributes],
  );

  const [selectedAttributes, setSelectedAttributes] = useState<
    Record<string, string>
  >(() => {
    if (!isVariable) return {};

    // Path-based mode: color comes from URL segment, size defaults from first matching variation.
    // localStorage is read in a useEffect to avoid SSR/hydration mismatch.
    if (productBasePath) {
      const colorKey = findSwatchAttribute(variationAttributes)?.slug;
      const attrs: Record<string, string> = {};
      if (colorKey && initialColor) attrs[colorKey] = initialColor;

      const firstMatch = product.variations.find(
        (v) =>
          !initialColor ||
          v.attributes.some(
            (a) =>
              (!colorKey || a.key === colorKey) && a.value === initialColor,
          ),
      );
      if (firstMatch) {
        for (const a of firstMatch.attributes) {
          if (!attrs[a.key]) attrs[a.key] = a.value;
        }
      }
      return attrs;
    }

    // Search-params mode (existing behavior)
    const fromParams: Record<string, string> = {};
    if (initialSearchParams) {
      for (const attr of variationAttributes) {
        const val = initialSearchParams[attr.slug];
        if (val) fromParams[attr.slug] = val;
      }
    }
    if (Object.keys(fromParams).length > 0) return fromParams;

    const firstVariation = product.variations[0];
    if (!firstVariation) return {};
    const defaults: Record<string, string> = {};
    for (const va of firstVariation.attributes) {
      defaults[va.key] = va.value;
    }
    return defaults;
  });

  // In path-based mode, restore the saved size from localStorage after mount
  // (deferred to avoid SSR/hydration mismatch).
  useEffect(() => {
    if (!productBasePath || !isVariable) return;
    const sizeKey = variationAttributes.find((a) => a.slug === "pa_size")?.slug;
    if (!sizeKey) return;
    const saved = localStorage.getItem(`headkit:size:${product.slug}`);
    if (!saved) return;
    setSelectedAttributes((prev) => {
      if (prev[sizeKey] === saved) return prev;
      return { ...prev, [sizeKey]: saved };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  const syncUrlWithAttributes = useCallback(
    (attrs: Record<string, string>) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(attrs)) {
        if (value) params.set(key, value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname],
  );

  const updateAttributes = useCallback(
    (next: Record<string, string>) => {
      if (productBasePath) {
        const colorKey = findSwatchAttribute(variationAttributes)?.slug;
        const sizeKey = variationAttributes.find(
          (a) => a.slug === "pa_size",
        )?.slug;

        // Persist size to localStorage on every change
        if (sizeKey && next[sizeKey]) {
          localStorage.setItem(`headkit:size:${product.slug}`, next[sizeKey]);
        }

        // Navigate when color changes; otherwise just update state
        if (colorKey && next[colorKey] !== selectedAttributes[colorKey]) {
          router.push(`${productBasePath}/${next[colorKey]}`, {
            scroll: false,
          });
          // Don't update state — new page will initialize correctly
          return;
        }

        setSelectedAttributes(next);
        return;
      }

      setSelectedAttributes(next);
      syncUrlWithAttributes(next);
    },
    [
      productBasePath,
      product.slug,
      variationAttributes,
      selectedAttributes,
      router,
      syncUrlWithAttributes,
    ],
  );

  const selectedVariation = useMemo<ProductVariation | null>(() => {
    if (!isVariable) return null;
    return (
      product.variations.find((v: ProductVariation) =>
        v.attributes.every((a) => selectedAttributes[a.key] === a.value),
      ) ?? null
    );
  }, [isVariable, product.variations, selectedAttributes]);

  // Hidden product context injected into the enquiry form so the WordPress entry
  // captures which product/variant the shopper asked about. Field names must
  // match snakeCased GF labels — see buildEnquiryInitialValues (ENG-794).
  const enquiryInitialValues = useMemo(
    () =>
      buildEnquiryInitialValues({
        productName: product.name,
        productUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}${pathname}`
            : undefined,
        variationAttributes,
        selectedAttributes,
        isColourAttrSlug: isColorAttrSlug,
      }),
    [product.name, pathname, variationAttributes, selectedAttributes],
  );

  const galleryImages = useMemo(() => {
    // Variation-owned gallery replaces the parent product gallery entirely
    // (hide parent featured + gallery while that colourway is selected).
    const variationGallery = (selectedVariation?.images ?? [])
      .filter((img) => Boolean(img?.src))
      .map((img) => ({
        src: img.src,
        alt: img.alt || product.name,
      }));
    if (variationGallery.length > 0) {
      return variationGallery;
    }

    const base = product.images.map((img) => ({
      src: img.src,
      alt: img.alt,
    }));
    return base.length > 0
      ? base
      : [{ src: "/placeholder.png", alt: product.name }];
  }, [product.images, product.name, selectedVariation]);

  // pickFirstPrice, not `??`: the gateway sends absent sale prices as ""
  // (empty string), which `??` keeps — rendering A$0.00 on simple non-sale
  // products (E2E P1-14).
  const displayPrice = pickFirstPrice(
    selectedVariation?.price,
    product.salePrice,
    product.price,
  );
  const displayRegularPrice = pickFirstPrice(
    selectedVariation?.regularPrice,
    product.regularPrice,
  );
  const isOnSale =
    selectedVariation !== null ? selectedVariation.onSale : product.onSale;

  const stockStatus =
    selectedVariation?.stockStatus ?? product.stockStatus ?? "instock";
  const isOutOfStock = stockStatus?.toLowerCase() === "outofstock";

  const targetId = isVariable
    ? (selectedVariation?.id ?? product.id)
    : product.id;
  const cartItemQty =
    cartData?.items.find((i) => i.id === String(targetId))?.quantity ?? 0;
  const maxStock = (selectedVariation ?? product).stockQuantity ?? null;
  const isAtStockLimit = maxStock !== null && cartItemQty + quantity > maxStock;

  // For a gift card the button must stay disabled until BOTH the form is valid
  // (isGiftCardFormValid, set on blur) AND the captured values have landed
  // (giftCardValues, set asynchronously by the form's watch/trigger). Gating on
  // validity alone let a fast click fire an add BEFORE giftConfig was captured,
  // sending a bare gift-card line the WooCommerce plugin rejects with
  // "some required data is missing" (GIFT-02 flake / race).
  const canAddToCart =
    (isVariable
      ? selectedVariation !== null && !isOutOfStock && !isAtStockLimit
      : !isOutOfStock && !isAtStockLimit) &&
    (!isGiftCard || (isGiftCardFormValid && giftCardValues !== null));

  // Sticky ATC bar: only after the primary ATC scrolls above the viewport
  // (not when it is still below the fold).
  useEffect(() => {
    const el = atcSectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const scrolledPast =
          !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setShowStickyAtc(scrolledPast);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const addToCartLabel =
    cartFeedback === "success"
      ? isQuoteMode
        ? "Added to quote!"
        : "Added to cart!"
      : cartFeedback === "error"
        ? "Error — try again"
        : isOutOfStock
          ? "Out of stock"
          : isAtStockLimit
            ? "Max qty reached"
            : isVariable && !selectedVariation
              ? "Select options"
              : isQuoteMode
                ? "Add to Quote"
                : "Add to cart";

  function handleAddToCart() {
    setCartFeedback("idle");
    startTransition(async () => {
      try {
        const id = isVariable
          ? (selectedVariation?.id ?? product.id)
          : product.id;

        const hasVariation =
          isVariable && Object.keys(selectedAttributes).length > 0;
        const variation = Object.entries(selectedAttributes).map(
          ([attribute, value]) => ({ attribute, value }),
        );

        const giftConfig =
          isGiftCard && giftCardValues
            ? {
                sendAsGift: true,
                toMultiple: [giftCardValues.wc_gc_giftcard_to_multiple],
                from: giftCardValues.wc_gc_giftcard_from,
                message: giftCardValues.wc_gc_giftcard_message ?? "",
                // "Now" (immediate) must OMIT the delivery date entirely — the
                // WooCommerce Gift Cards plugin validates a supplied delivery_date as a
                // future timestamp and rejects "today"/past (and empty) with "Invalid
                // delivery date." Sending an empty string makes commerce drop the field
                // (its `if DeliveryDate != ""` guard), so the plugin sends immediately.
                // Only "Later" forwards the user-picked (future) date.
                deliveryDate:
                  giftCardValues.wc_gc_giftcard_select_delivery ===
                  DeliveryType.Later
                    ? giftCardValues.wc_gc_giftcard_delivery
                    : "",
              }
            : undefined;

        const result = await addToCartAction(
          hasVariation
            ? { id, quantity, variation, ...(giftConfig ? { giftConfig } : {}) }
            : { id, quantity, ...(giftConfig ? { giftConfig } : {}) },
        );
        if (result.success) {
          setCartData(result.cart);
          toggleCart(true);
          setQuantity(1);
        }
        setCartFeedback(result.success ? "success" : "error");
      } catch {
        // Never let an unhandled rejection from the server action trip the
        // route error boundary — show inline feedback instead.
        setCartFeedback("error");
      }
      setTimeout(() => setCartFeedback("idle"), 2000);
    });
  }

  const reviewsEnabled = Boolean(product.reviewsEnabled);
  const specifications = product.specifications?.trim()
    ? product.specifications
    : null;

  const tabs: Array<{
    key: string;
    label: string;
    hasContent: boolean;
  }> = [
    {
      key: "description",
      label: "Description",
      hasContent: !!product.description,
    },
    {
      key: "specifications",
      label: "Specifications",
      hasContent: !!specifications?.trim(),
    },
    {
      key: "additional",
      label: "Additional Info",
      hasContent:
        product.attributes.filter((a) => a.visible && !a.variation).length > 0,
    },
    {
      key: "reviews",
      label: "Reviews",
      hasContent: reviewsEnabled,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.hasContent);

  const handleWishlistToggle = () => {
    const { added } = toggleWishlist({ id: product.id, slug: product.slug });
    setWishlisted(added);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Left: image gallery */}
        <ProductImageGallery
          images={galleryImages}
          isSale={isOnSale}
          isNew={product.isNew}
        />

        {/* Right: product info */}
        <div className="flex flex-col">
          <h1 className="mb-3 text-primary">
            {decodeHtmlEntities(product.name)}
          </h1>

          {product.shortDescription && (
            <div
              className="mb-5 text-base leading-normal text-primary [&_p]:mb-3 [&_p:last-child]:mb-0"
              dangerouslySetInnerHTML={{
                __html: formatWooRichText(product.shortDescription),
              }}
            />
          )}

          {/* Variation attribute selectors */}
          {isVariable && variationAttributes.length > 0 && (
            <div className="mb-5 flex flex-col gap-4">
              {variationAttributes.map((attr) => (
                <div key={attr.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="font-semibold text-primary">{attr.name}</p>
                    {selectedAttributes[attr.slug] && (
                      <span className="capitalize text-gray-700">
                        {
                          attr.fullOptions.find(
                            (o) => o.slug === selectedAttributes[attr.slug],
                          )?.name
                        }
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {attr.fullOptions.map((option) => {
                      const isUnavailable = !product.variations.some(
                        (v: ProductVariation) =>
                          v.attributes.some(
                            (a) =>
                              a.key === attr.slug && a.value === option.slug,
                          ),
                      );

                      const isIncompatible =
                        !isUnavailable &&
                        !product.variations.some((v: ProductVariation) => {
                          const matchesThis = v.attributes.some(
                            (a) =>
                              a.key === attr.slug && a.value === option.slug,
                          );
                          const matchesOthers = variationAttributes
                            .filter((other) => other.slug !== attr.slug)
                            .every((other) => {
                              const sel = selectedAttributes[other.slug];
                              return (
                                !sel ||
                                v.attributes.some(
                                  (a) =>
                                    a.key === other.slug && a.value === sel,
                                )
                              );
                            });
                          return matchesThis && matchesOthers;
                        });

                      return (
                        <VariantSwatch
                          key={option.slug}
                          label={option.name}
                          value={option.slug}
                          color1={option.swatchColor}
                          color2={option.swatchColor2}
                          selectedOptionValue={
                            selectedAttributes[attr.slug] ?? ""
                          }
                          onClick={() => {
                            const next = {
                              ...selectedAttributes,
                              [attr.slug]: option.slug,
                            };
                            const isValid = product.variations.some(
                              (v: ProductVariation) =>
                                v.attributes.every(
                                  (a) => next[a.key] === a.value,
                                ),
                            );
                            if (!isValid) {
                              const fallback = product.variations.find(
                                (v: ProductVariation) =>
                                  v.attributes.some(
                                    (a) =>
                                      a.key === attr.slug &&
                                      a.value === option.slug,
                                  ),
                              );
                              if (fallback) {
                                const cascaded: Record<string, string> = {};
                                for (const a of fallback.attributes) {
                                  cascaded[a.key] = a.value;
                                }
                                updateAttributes(cascaded);
                                return;
                              }
                            }
                            updateAttributes(next);
                          }}
                          isUnavailable={isUnavailable}
                          isIncompatible={isIncompatible}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gift card recipient form */}
          {isGiftCard && (
            <Suspense fallback={null}>
              <GiftCardForm
                emitClickEvent={(values) => setGiftCardValues(values)}
                onFormValid={(valid) => setIsGiftCardFormValid(valid)}
              />
            </Suspense>
          )}

          {/* Availability status — hidden for HeadKit Quote checkout */}
          {!isQuoteMode && (
            <div className="mb-4">
              {stockSlot ?? (
                <AvailabilityStatus
                  stockStatus={stockStatus}
                  stockQuantity={
                    (selectedVariation ?? product).stockQuantity ?? null
                  }
                />
              )}
            </div>
          )}

          {/* Price */}
          <div className="mb-6">
            <ProductPrice
              price={displayPrice}
              regularPrice={displayRegularPrice}
              onSale={isOnSale}
              quoteMessage="Add to Quote for pricing"
            />
          </div>

          {/* Quantity selector + Add to Cart + Wishlist */}
          <div ref={atcSectionRef} className="mb-6 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-gray-300">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="cursor-pointer px-3 py-2.5 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <MinusIcon className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={1}
                max={maxStock ?? 99}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1) setQuantity(val);
                }}
                className="w-12 border-x border-gray-300 py-2 text-center text-sm font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Quantity"
              />
              <button
                type="button"
                onClick={() =>
                  setQuantity((q) =>
                    maxStock ? Math.min(maxStock, q + 1) : q + 1,
                  )
                }
                disabled={maxStock !== null && quantity >= maxStock}
                className="cursor-pointer px-3 py-2.5 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>

            <Button
              className={cn(
                "flex-1",
                cartFeedback === "success" && "bg-green-600 hover:bg-green-700",
                cartFeedback === "error" && "bg-red-600 hover:bg-red-700",
              )}
              disabled={!canAddToCart}
              loading={addingToCart}
              loadingText="Adding…"
              rightIcon={isQuoteMode ? "plus" : "shoppingBag"}
              onClick={handleAddToCart}
            >
              {addToCartLabel}
            </Button>

            <button
              type="button"
              onClick={handleWishlistToggle}
              aria-label={
                wishlisted ? "Remove from wishlist" : "Add to wishlist"
              }
              aria-pressed={wishlisted}
              className={cn(
                "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-button)] border border-primary transition-colors",
                wishlisted
                  ? "bg-primary text-on-primary"
                  : "bg-transparent text-primary hover:opacity-80",
              )}
            >
              <HeartIcon className="h-5 w-5" />
            </button>
          </div>

          {!isGiftCard && (
            <div className="mb-6">
              <ProductEnquiry
                formId={ENQUIRY_FORM_ID}
                productName={product.name}
                initialValues={enquiryInitialValues}
              />
            </div>
          )}

          {/* SKU */}
          {product.sku && (
            <p className="mb-4 text-xs text-gray-800">SKU: {product.sku}</p>
          )}

          {/* Tags */}
          {product.tags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs font-medium text-primary/80"
                >
                  {decodeHtmlEntities(tag.name)}
                </span>
              ))}
            </div>
          )}

          {/* Accordion: Description / Specifications / Additional Info / Reviews */}
          {visibleTabs.length > 0 && visibleTabs[0] && (
            <div className="border-t pt-2">
              <Accordion
                type="single"
                collapsible
                defaultValue={visibleTabs[0].key}
                className="w-full"
              >
                {visibleTabs.map((tab) => (
                  <AccordionItem key={tab.key} value={tab.key}>
                    {/* Radix Header is already an h3 — keep H3 size/family; bump weight to match */}
                    <AccordionTrigger className="py-4 text-left font-semibold hover:no-underline">
                      {tab.label}
                    </AccordionTrigger>
                    <AccordionContent className="text-base">
                      {tab.key === "description" && product.description && (
                        <div
                          className="prose max-w-none text-base text-primary prose-p:my-3 prose-p:first:mt-0 prose-p:last:mb-0"
                          dangerouslySetInnerHTML={{
                            __html: formatWooRichText(product.description),
                          }}
                        />
                      )}

                      {tab.key === "specifications" && specifications && (
                        <div
                          className="prose max-w-none text-base text-primary prose-p:my-3 prose-p:first:mt-0 prose-p:last:mb-0"
                          dangerouslySetInnerHTML={{
                            __html: formatWooRichText(specifications),
                          }}
                        />
                      )}

                      {tab.key === "additional" && (
                        <div className="space-y-3">
                          {product.attributes
                            .filter((a) => a.visible && !a.variation)
                            .map((attr) => (
                              <div
                                key={attr.id}
                                className="flex gap-4 text-base"
                              >
                                <span className="w-32 shrink-0 font-medium text-gray-700">
                                  {decodeHtmlEntities(attr.name)}
                                </span>
                                <span className="text-gray-600">
                                  {attr.options
                                    .map((o) => decodeHtmlEntities(o))
                                    .join(", ")}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}

                      {tab.key === "reviews" && (
                        <p className="text-base text-gray-500">
                          Reviews coming soon.
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </div>

      {/* Sticky ATC — desktop + mobile, after main ATC scrolls out of view */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-brand-bg/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm transition-transform duration-300 md:px-10",
          showStickyAtc
            ? "translate-y-0"
            : "pointer-events-none translate-y-full",
        )}
        aria-hidden={!showStickyAtc}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 md:gap-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary md:text-base">
              {decodeHtmlEntities(product.name)}
            </p>
            <div className="mt-0.5">
              <ProductPrice
                price={displayPrice}
                regularPrice={displayRegularPrice}
                onSale={isOnSale}
                size="default"
                quoteMessage="Add to Quote for pricing"
              />
            </div>
          </div>
          <div className="hidden items-center rounded-md border border-gray-300 sm:flex">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="cursor-pointer px-3 py-2 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <span className="w-10 border-x border-gray-300 py-2 text-center text-sm font-medium">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() =>
                setQuantity((q) =>
                  maxStock ? Math.min(maxStock, q + 1) : q + 1,
                )
              }
              disabled={maxStock !== null && quantity >= maxStock}
              className="cursor-pointer px-3 py-2 text-gray-600 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Increase quantity"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          <Button
            className={cn(
              "min-w-[140px] shrink-0 md:min-w-[180px]",
              cartFeedback === "success" && "bg-green-600 hover:bg-green-700",
              cartFeedback === "error" && "bg-red-600 hover:bg-red-700",
            )}
            disabled={!canAddToCart}
            loading={addingToCart}
            loadingText="Adding…"
            rightIcon={isQuoteMode ? "plus" : "shoppingBag"}
            onClick={handleAddToCart}
          >
            {addToCartLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
