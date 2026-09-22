/**
 * PDP line under the title. Shopify metafields arrive as plain text;
 * strip leftover tags/entities and hide blank values so other stores
 * that never set the field render nothing.
 *
 * Accepts `unknown` because customer storefronts may still be on an SDK
 * whose Product type has no `subtitle` — `"subtitle" in product` then
 * types the value as unknown.
 */
export function productSubtitle(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
