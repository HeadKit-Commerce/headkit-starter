"use client";

import {
  useMemo,
  useState,
  useTransition,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Product, ProductAttribute, ProductVariation } from "@headkit/sdk";
import { ProductImageGallery } from "@/components/headkit-ui/product-image-gallery";
import { ProductPrice } from "@/components/headkit-ui/product-price";
import { VariantSwatch } from "@/components/headkit-ui/variant-swatch";
import { AvailabilityStatus } from "@/components/headkit-ui/availability-status";
import { Button } from "@/components/ui/button";
import { MinusIcon, PlusIcon } from "@/components/icon";
import { addToCartAction } from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { cn } from "@/lib/utils";
import { GiftCardForm, type GiftCardFormValues, DeliveryType } from "@/components/gift-card-form";
import { Breadcrumb } from "@/components/headkit-ui/breadcrumb";

interface Props {
  product: Product;
  initialSearchParams?: Record<string, string>;
  breadcrumbItems?: { name: string; uri: string; current: boolean }[];
}

const VARIABLE = "VARIABLE";

type TabKey = "description" | "additional" | "reviews";

export function ProductDetail({ product, initialSearchParams, breadcrumbItems }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [addingToCart, startTransition] = useTransition();
  const [cartFeedback, setCartFeedback] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<TabKey>("description");
  const { cartData, setCartData, toggleCart } = useCartContext();

  const isVariable = product.type?.toUpperCase() === VARIABLE;
  const isGiftCard = product.type?.toLowerCase() === "giftcard";
  const [giftCardValues, setGiftCardValues] = useState<GiftCardFormValues | null>(null);
  const [isGiftCardFormValid, setIsGiftCardFormValid] = useState(false);

  const variationAttributes = useMemo(
    () => product.attributes.filter((a: ProductAttribute) => a.variation),
    [product.attributes],
  );

  const [selectedAttributes, setSelectedAttributes] = useState<
    Record<string, string>
  >(() => {
    if (!isVariable) return {};

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
      setSelectedAttributes(next);
      syncUrlWithAttributes(next);
    },
    [syncUrlWithAttributes],
  );

  const selectedVariation = useMemo<ProductVariation | null>(() => {
    if (!isVariable) return null;
    return (
      product.variations.find((v: ProductVariation) =>
        v.attributes.every((a) => selectedAttributes[a.key] === a.value),
      ) ?? null
    );
  }, [isVariable, product.variations, selectedAttributes]);

  const galleryImages = useMemo(() => {
    const base = product.images.map((img) => ({
      src: img.src,
      alt: img.alt,
    }));
    if (selectedVariation?.image?.src) {
      return [
        { src: selectedVariation.image.src, alt: selectedVariation.image.alt },
        ...base.filter((b) => b.src !== selectedVariation.image.src),
      ];
    }
    return base.length > 0 ? base : [{ src: "/placeholder.png", alt: product.name }];
  }, [product.images, product.name, selectedVariation]);

  const displayPrice =
    selectedVariation?.price ?? product.salePrice ?? product.price;
  const displayRegularPrice =
    selectedVariation?.regularPrice ?? product.regularPrice;
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

  const canAddToCart = (isVariable
    ? selectedVariation !== null && !isOutOfStock && !isAtStockLimit
    : !isOutOfStock && !isAtStockLimit)
    && (!isGiftCard || isGiftCardFormValid);

  function handleAddToCart() {
    setCartFeedback("idle");
    startTransition(async () => {
      const id = isVariable
        ? (selectedVariation?.id ?? product.id)
        : product.id;

      const hasVariation =
        isVariable && Object.keys(selectedAttributes).length > 0;
      const variation = Object.entries(selectedAttributes).map(
        ([attribute, value]) => ({ attribute, value }),
      );

      const giftConfig = isGiftCard && giftCardValues ? {
        sendAsGift: true,
        toMultiple: [giftCardValues.wc_gc_giftcard_to_multiple],
        from: giftCardValues.wc_gc_giftcard_from,
        message: giftCardValues.wc_gc_giftcard_message ?? "",
        deliveryDate:
          giftCardValues.wc_gc_giftcard_select_delivery === DeliveryType.Later
            ? giftCardValues.wc_gc_giftcard_delivery
            : new Date().toISOString().split("T")[0]!,
      } : undefined;

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
      setTimeout(() => setCartFeedback("idle"), 2000);
    });
  }

  const tabs: Array<{ key: TabKey; label: string; hasContent: boolean }> = [
    {
      key: "description",
      label: "Description",
      hasContent: !!product.description,
    },
    {
      key: "additional",
      label: "Additional Info",
      hasContent:
        product.attributes.filter((a) => a.visible && !a.variation).length > 0,
    },
    { key: "reviews", label: "Reviews", hasContent: false },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      {/* Left: image gallery */}
      <ProductImageGallery
        images={galleryImages}
        isSale={isOnSale}
        isNew={product.isNew}
      />

      {/* Right: product info */}
      <div className="flex flex-col">
        {breadcrumbItems && <div className="mb-4"><Breadcrumb items={breadcrumbItems} /></div>}
        <h1 className="mb-3 text-2xl font-bold leading-tight text-purple-900 md:text-3xl">
          {product.name}
        </h1>

        {product.shortDescription && (
          <div
            className="mb-5 text-sm leading-relaxed text-purple-800"
            dangerouslySetInnerHTML={{ __html: product.shortDescription }}
          />
        )}

        {/* Variation attribute selectors */}
        {isVariable && variationAttributes.length > 0 && (
          <div className="mb-5 flex flex-col gap-4">
            {variationAttributes.map((attr: ProductAttribute) => (
              <div key={attr.id}>
                <div className="mb-2 flex items-center gap-2">
                  <p className="font-semibold text-purple-800">{attr.name}</p>
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
                          (a) => a.key === attr.slug && a.value === option.slug,
                        ),
                    );

                    const isIncompatible =
                      !isUnavailable &&
                      !product.variations.some((v: ProductVariation) => {
                        const matchesThis = v.attributes.some(
                          (a) => a.key === attr.slug && a.value === option.slug,
                        );
                        const matchesOthers = variationAttributes
                          .filter((other) => other.slug !== attr.slug)
                          .every((other) => {
                            const sel = selectedAttributes[other.slug];
                            return (
                              !sel ||
                              v.attributes.some(
                                (a) => a.key === other.slug && a.value === sel,
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
          <GiftCardForm
            emitClickEvent={(values) => setGiftCardValues(values)}
            onFormValid={(valid) => setIsGiftCardFormValid(valid)}
          />
        )}

        {/* Availability status */}
        <div className="mb-4">
          <AvailabilityStatus
            stockStatus={stockStatus}
            stockQuantity={(selectedVariation ?? product).stockQuantity ?? null}
          />
        </div>

        {/* Price */}
        <div className="mb-6">
          <ProductPrice
            price={displayPrice}
            regularPrice={displayRegularPrice}
            onSale={isOnSale}
          />
        </div>

        {/* Quantity selector + Add to Cart */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center rounded-md border border-gray-300">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="px-3 py-2.5 text-gray-600 transition-colors hover:text-gray-900 disabled:opacity-40"
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
              className="px-3 py-2.5 text-gray-600 transition-colors hover:text-gray-900 disabled:opacity-40"
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
            rightIcon="shoppingBag"
            onClick={handleAddToCart}
          >
            {cartFeedback === "success"
              ? "Added to cart!"
              : cartFeedback === "error"
                ? "Error — try again"
                : isOutOfStock
                  ? "Out of stock"
                  : isAtStockLimit
                    ? "Max qty reached"
                    : isVariable && !selectedVariation
                      ? "Select options"
                      : "Add to cart"}
          </Button>
        </div>

        {/* SKU */}
        {product.sku && (
          <p className="mb-6 text-xs text-gray-500">SKU: {product.sku}</p>
        )}

        {/* Tabs: Description / Additional Info / Reviews */}
        <div className="border-t pt-6">
          <div className="flex border-b">
            {tabs
              .filter((t) => t.hasContent || t.key === "reviews")
              .map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative px-4 py-3 text-sm font-medium transition-colors",
                    activeTab === tab.key
                      ? "text-purple-800"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-800" />
                  )}
                </button>
              ))}
          </div>

          <div className="py-6">
            {activeTab === "description" && product.description && (
              <div
                className="prose prose-sm max-w-none text-purple-800"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            )}

            {activeTab === "additional" && (
              <div className="space-y-3">
                {product.attributes
                  .filter((a) => a.visible && !a.variation)
                  .map((attr) => (
                    <div key={attr.id} className="flex gap-4 text-sm">
                      <span className="w-32 shrink-0 font-medium text-gray-700">
                        {attr.name}
                      </span>
                      <span className="text-gray-600">
                        {attr.options.join(", ")}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {activeTab === "reviews" && (
              <p className="text-sm text-gray-500">Reviews coming soon.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
