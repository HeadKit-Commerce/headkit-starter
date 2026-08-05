/**
 * Build Gravity Forms initialValues for the PDP product-enquiry form.
 *
 * Field names must match the snakeCased labels of Hidden (or Visibility→Hidden)
 * fields on the enquiry form. Values are also used by GravityForm to suppress
 * rendering of matching labels.
 *
 * Recommended GF Hidden field labels:
 * - Product Name → product_name
 * - Product URL → product_url
 * - Product Options → product_options (catch-all: "Colour: Red; Size: M")
 * - Optional per-attribute: Product Colour / Product Size / or the attribute name
 */

import { snakeCase } from "@/lib/gravity-form-utils";

export interface EnquiryVariationAttribute {
  slug: string;
  name: string;
  fullOptions: ReadonlyArray<{ slug: string; name: string }>;
}

export interface EnquiryInitialValue {
  fieldName: string;
  value: string;
}

function isColourSlug(slug: string): boolean {
  return (
    slug === "pa_color" ||
    slug === "pa_colour" ||
    slug.includes("color") ||
    slug.includes("colour")
  );
}

function isSizeSlug(slug: string): boolean {
  return slug.includes("size");
}

function pushUnique(
  values: EnquiryInitialValue[],
  fieldName: string,
  value: string,
): void {
  if (!fieldName || !value) return;
  if (values.some((v) => v.fieldName === fieldName)) return;
  values.push({ fieldName, value });
}

/**
 * Map the selected product + variation attributes into GF field injections.
 */
export function buildEnquiryInitialValues(input: {
  productName: string;
  productUrl?: string | undefined;
  variationAttributes: ReadonlyArray<EnquiryVariationAttribute>;
  selectedAttributes: Readonly<Record<string, string>>;
  isColourAttrSlug?: (slug: string) => boolean;
}): EnquiryInitialValue[] {
  const isColour = input.isColourAttrSlug ?? isColourSlug;
  const values: EnquiryInitialValue[] = [
    { fieldName: "product_name", value: input.productName },
  ];
  if (input.productUrl) {
    values.push({ fieldName: "product_url", value: input.productUrl });
  }

  const optionPairs: string[] = [];

  for (const attr of input.variationAttributes) {
    const selectedSlug = input.selectedAttributes[attr.slug];
    if (!selectedSlug) continue;

    const optionName =
      attr.fullOptions.find((o) => o.slug === selectedSlug)?.name ??
      selectedSlug;

    const attrLabel = attr.name.trim() || attr.slug;
    optionPairs.push(`${attrLabel}: ${optionName}`);

    // Prefer human attribute name (e.g. "Finish" → finish) so GF fields
    // labeled after the Woo attribute capture the selection.
    pushUnique(values, snakeCase(attrLabel), optionName);

    // Also slug without pa_ prefix (pa_finish → finish).
    const slugKey = snakeCase(attr.slug.replace(/^pa_/, ""));
    pushUnique(values, slugKey, optionName);

    // Legacy / seed-form keys for colour & size.
    if (isColour(attr.slug)) {
      pushUnique(values, "product_colour", optionName);
      pushUnique(values, "colour", optionName);
      pushUnique(values, "color", optionName);
    }
    if (isSizeSlug(attr.slug)) {
      pushUnique(values, "product_size", optionName);
      pushUnique(values, "size", optionName);
    }
  }

  if (optionPairs.length > 0) {
    const joined = optionPairs.join("; ");
    pushUnique(values, "product_options", joined);
    pushUnique(values, "selected_variations", joined);
  }

  return values;
}
