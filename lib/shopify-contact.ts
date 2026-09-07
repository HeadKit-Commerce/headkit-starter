/**
 * Shopify's built-in Online Store contact form.
 *
 * There is no Storefront GraphQL mutation for this (Hydrogen discussion #654).
 * Hydrogen POSTs `https://{shop}.myshopify.com/contact` from a server action
 * with `form_type=contact` and `contact[email|name|phone|body]`. HeadKit does
 * the same from the Next.js storefront so Admin → Settings → Notifications
 * still receive mail.
 *
 * This is not Gravity Forms and not the Shopify Forms app (Liquid / theme-app
 * extension only). The redirect theme cannot host a shopper form.
 */

export type ShopifyContactContext =
  | "contact"
  | "product"
  | "general"
  | "partnerships";

export type ShopifyContactExtra = {
  label: string;
  value: string;
};

export type ShopifyContactInput = {
  name: string;
  email: string;
  phone?: string | undefined;
  body: string;
  context?: ShopifyContactContext | undefined;
  extras?: readonly ShopifyContactExtra[] | undefined;
};

const ENQUIRY_EXTRA_LABELS: Readonly<Record<string, string>> = {
  product_name: "Product Name",
  product_url: "Product URL",
  product_options: "Product Options",
  product_size: "Product Size",
  product_colour: "Product Colour",
};

/** Normalize `{shop}.myshopify.com` (with or without scheme) to an origin. */
export function shopifyContactOrigin(storeDomain: string): string {
  let host = storeDomain.trim();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/\/$/, "");
  if (!host) {
    throw new Error("Shopify store domain is empty");
  }
  return `https://${host}`;
}

/** Online Store contact POST URL. */
export function shopifyContactEndpoint(storeDomain: string): string {
  return `${shopifyContactOrigin(storeDomain)}/contact`;
}

export function shopifyContactBodyPrefix(
  context: ShopifyContactContext | undefined,
): string {
  switch (context) {
    case "product":
      return "Product enquiry";
    case "general":
      return "Enquiry";
    case "partnerships":
      return "Partnerships";
    default:
      return "";
  }
}

/** Klaviyo checkbox copy. Uses the store name so Velvet reads “from Velvet”. */
export function shopifyUpdatesSubscribeLabel(
  storeName: string | null | undefined,
): string {
  const name = storeName?.trim();
  if (!name) {
    return "I want to receive updates";
  }
  return `I want to receive updates from ${name}`;
}

export function extrasFromEnquiryValues(
  values: ReadonlyArray<{ fieldName: string; value: string }>,
): ShopifyContactExtra[] {
  const extras: ShopifyContactExtra[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const label = ENQUIRY_EXTRA_LABELS[item.fieldName];
    if (!label || !item.value.trim() || seen.has(label)) continue;
    seen.add(label);
    extras.push({ label, value: item.value.trim() });
  }
  return extras;
}

export function buildShopifyContactBody(input: ShopifyContactInput): string {
  const parts: string[] = [];
  const prefix = shopifyContactBodyPrefix(input.context);
  const message = input.body.trim();
  if (prefix && message) {
    parts.push(`${prefix}\n\n${message}`);
  } else if (prefix) {
    parts.push(prefix);
  } else if (message) {
    parts.push(message);
  }
  const extras = (input.extras ?? [])
    .map((extra) => {
      const value = extra.value.trim();
      return value ? `${extra.label}: ${value}` : "";
    })
    .filter(Boolean);
  if (extras.length > 0) {
    parts.push(extras.join("\n"));
  }
  return parts.join("\n\n");
}

export function encodeShopifyContactForm(input: ShopifyContactInput): URLSearchParams {
  const email = input.email.trim();
  if (!email) {
    throw new Error("email is required");
  }
  const vals = new URLSearchParams();
  vals.set("form_type", "contact");
  vals.set("utf8", "✓");
  vals.set("contact[email]", email);
  const name = input.name.trim();
  if (name) vals.set("contact[name]", name);
  const phone = input.phone?.trim() ?? "";
  if (phone) vals.set("contact[phone]", phone);
  const body = buildShopifyContactBody(input);
  if (body) vals.set("contact[body]", body);
  return vals;
}

/** Shopify answers 302 `?contact_posted=true` on success; do not follow it. */
export function shopifyContactAccepted(status: number): boolean {
  return (
    status === 200 ||
    status === 201 ||
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

export async function postShopifyContact(
  storeDomain: string,
  input: ShopifyContactInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const origin = shopifyContactOrigin(storeDomain);
  const endpoint = shopifyContactEndpoint(storeDomain);
  const body = encodeShopifyContactForm(input);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
      Origin: origin,
      Referer: `${origin}/`,
    },
    body,
    redirect: "manual",
    cache: "no-store",
  });
  if (!shopifyContactAccepted(response.status)) {
    throw new Error(`Shopify contact form returned ${response.status}`);
  }
}
