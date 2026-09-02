/**
 * Custom product badges from Shopify/Woo tags.
 *
 * - Tags prefixed `badge:` always show (e.g. `badge:NEW` → "NEW").
 * - Other tags show when listed in `overrides/theme.json` `catalog.badgeTags`
 *   (case-insensitive name or slug match).
 */

export interface ProductTagLike {
  name?: string | null;
  slug?: string | null;
}

export interface CustomProductBadge {
  label: string;
  slug: string;
}

const BADGE_PREFIX = "badge:";

function tagTokens(tag: ProductTagLike): { name: string; slug: string } {
  const name = (tag.name ?? "").trim();
  const slug = (tag.slug ?? "").trim();
  return { name, slug };
}

function allowlistSet(allowlist: readonly string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const raw of allowlist ?? []) {
    const t = raw.trim().toLowerCase();
    if (t) set.add(t);
  }
  return set;
}

function badgeLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().startsWith(BADGE_PREFIX)) {
    return trimmed.slice(BADGE_PREFIX.length).trim();
  }
  return trimmed;
}

/** True when this tag is a card/PDP badge (prefix or allowlist). */
export function isBadgeTag(
  tag: ProductTagLike,
  allowlist?: readonly string[],
): boolean {
  const { name, slug } = tagTokens(tag);
  if (!name && !slug) return false;
  if (name.toLowerCase().startsWith(BADGE_PREFIX)) return true;
  if (slug.toLowerCase().startsWith(BADGE_PREFIX)) return true;
  const allowed = allowlistSet(allowlist);
  if (allowed.size === 0) return false;
  return allowed.has(name.toLowerCase()) || allowed.has(slug.toLowerCase());
}

/**
 * Pills to render on cards and the PDP gallery. Dedupes by lowercase label.
 * Callers hide labels that already have a dedicated New/Sale flag.
 */
export function productBadgesFromTags(
  tags: readonly (ProductTagLike | null | undefined)[] | null | undefined,
  allowlist?: readonly string[],
  opts?: { hideNew?: boolean; hideSale?: boolean },
): CustomProductBadge[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: CustomProductBadge[] = [];
  for (const tag of tags) {
    if (!tag || !isBadgeTag(tag, allowlist)) continue;
    const { name, slug } = tagTokens(tag);
    const label = badgeLabel(name || slug);
    if (!label) continue;
    const key = label.toLowerCase();
    if (opts?.hideNew && key === "new") continue;
    if (opts?.hideSale && key === "sale") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      slug: slug || key.replace(/\s+/g, "-"),
    });
  }
  return out;
}
