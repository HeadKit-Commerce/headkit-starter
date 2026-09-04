import { decodeHtmlEntities } from "@/lib/utils";

function normalizeProductCopy(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Buy-box excerpt, or empty when it is the same catalog copy as Description.
 * Shopify has no native short description, so commerce used to copy
 * description into shortDescription — that must not render twice.
 */
export function distinctShortDescription(
  shortDescription: string,
  description: string,
): string {
  const excerpt = normalizeProductCopy(shortDescription);
  if (excerpt === "") {
    return "";
  }
  if (excerpt === normalizeProductCopy(description)) {
    return "";
  }
  return shortDescription;
}
