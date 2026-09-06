"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GravityForm } from "@/components/gravity-form-lazy";
import { ShopifyContactForm } from "@/components/shopify-contact-form";
import { getGravityFormById } from "@/lib/gravity-form-actions";
import { extrasFromEnquiryValues } from "@/lib/shopify-contact";

interface ProductEnquiryProps {
  /** Gravity Forms form id for the product-enquiry form (Woo only). */
  formId: string;
  /** Product name, shown in the panel copy. */
  productName: string;
  /**
   * Hidden field values injected into the submission. Each `fieldName` must be
   * the snakeCased label of a Gravity Forms field (type Hidden, or Visibility
   * Hidden) so it attaches to the correct entry — e.g. `product_name`,
   * `product_url`, `product_options` (catch-all), `product_size` / `size`,
   * `product_colour` / `colour`, or the attribute name (`finish`, etc.).
   * Shopify appends the matching extras onto `contact[body]`.
   */
  initialValues: { fieldName: string; value: string }[];
  /** Disable the trigger (e.g. before the product has fully loaded). */
  disabled?: boolean;
  /**
   * Shopify storefronts have no Gravity Forms. When true, skip the GF probe
   * and render the built-in Online Store contact form.
   */
  shopifyContact?: boolean;
}

/**
 * PDP "Enquire about this product" control. Toggles an inline panel.
 *
 * Woo: Gravity Forms product-enquiry form, injecting the current product
 * context as hidden fields (ENG-794). Renders nothing when GF can't load.
 *
 * Shopify: always available; built-in Online Store contact form with the
 * same product extras appended to `contact[body]`.
 */
export function ProductEnquiry({
  formId,
  productName,
  initialValues,
  disabled = false,
  shopifyContact = false,
}: ProductEnquiryProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  // null = still checking, true/false = form availability resolved.
  const [available, setAvailable] = useState<boolean | null>(
    shopifyContact ? true : null,
  );

  useEffect(() => {
    if (shopifyContact) {
      setAvailable(true);
      return;
    }
    let active = true;
    getGravityFormById(formId)
      .then((res) => {
        if (active) setAvailable(Boolean(res?.gfForm));
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [formId, shopifyContact]);

  // While checking, or when Gravity Forms/the form is unavailable, render
  // nothing — no Enquire button at all.
  if (!available) return null;

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        fullWidth
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {open ? "Close enquiry" : "Enquire about this product"}
      </Button>

      {open && (
        <div className="mt-4 rounded-lg border border-gray-200 p-5">
          <h3 className="text-lg text-primary">Product enquiry</h3>
          <p className="mb-4 mt-1 text-sm text-gray-600">
            Ask us anything about {productName} — we&apos;ll get back to you
            shortly.
          </p>
          {shopifyContact ? (
            <ShopifyContactForm
              context="product"
              disabled={disabled}
              extras={extrasFromEnquiryValues(initialValues)}
            />
          ) : (
            <GravityForm
              id="productEnquiryForm"
              formId={formId}
              initialValues={initialValues}
              disabled={disabled}
            />
          )}
        </div>
      )}
    </div>
  );
}
