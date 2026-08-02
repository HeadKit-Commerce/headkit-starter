"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GravityForm } from "@/components/gravity-form-lazy";
import { getGravityFormById } from "@/lib/gravity-form-actions";

interface ProductEnquiryProps {
  /** Gravity Forms form id for the product-enquiry form. */
  formId: string;
  /** Product name, shown in the panel copy. */
  productName: string;
  /**
   * Hidden field values injected into the submission. Each `fieldName` must be
   * the snakeCased label of a (hidden) Gravity Forms field so it attaches to the
   * correct entry field — e.g. `product_name`, `product_url`, `product_size`,
   * `product_colour`.
   */
  initialValues: { fieldName: string; value: string }[];
  /** Disable the trigger (e.g. before the product has fully loaded). */
  disabled?: boolean;
}

/**
 * PDP "Enquire about this product" control. Toggles an inline panel containing
 * the Gravity Forms product-enquiry form, injecting the current product context
 * (name, URL, selected size/colour) as hidden fields (ENG-794).
 *
 * Renders nothing when the form can't load — Gravity Forms not installed or the
 * form id missing — so the template degrades cleanly instead of showing an
 * Enquire button that dead-ends. Availability is checked once on mount.
 */
export function ProductEnquiry({
  formId,
  productName,
  initialValues,
  disabled = false,
}: ProductEnquiryProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  // null = still checking, true/false = form availability resolved.
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
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
  }, [formId]);

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
          <h3 className="text-lg font-semibold text-primary">
            Product enquiry
          </h3>
          <p className="mb-4 mt-1 text-sm text-gray-600">
            Ask us anything about {productName} — we&apos;ll get back to you
            shortly.
          </p>
          <GravityForm
            id="productEnquiryForm"
            formId={formId}
            initialValues={initialValues}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
