/**
 * The `/f/<slug>` facet path codec, and nothing else.
 *
 * Pure and dependency-free, for the same reason
 * `lib/canonical-redirect-request.ts` is: `proxy.ts` imports it to fold legacy
 * facet QUERY keys into the path form, and the proxy must stay clear of
 * anything that reaches the SDK or the UI layer.
 * `components/headkit-ui/collection/utils.ts` re-exports every name here, so
 * existing callers are unchanged and there is only ever ONE copy of the codec —
 * a second one would drift, and an encoder that disagrees with its decoder
 * produces a URL that 200s on a silently empty grid.
 */

/**
 * Reserved facet-name token for the brand group in the path slug. Attribute
 * groups are keyed by their stripped attribute name (e.g. `color`); the brand
 * group is keyed by this literal. `brand` is the taxonomy `product_brand`,
 * never a WC product attribute, so there is no collision with attribute names.
 */
export const BRAND_GROUP_KEY = "brand";

/**
 * Escape introducer for delimiter-safe value encoding. The readable scheme uses
 * `.` to join values within a facet group and `_` to separate facet groups; a
 * value that itself contains `.`, `_`, or the introducer `~` would corrupt the
 * round-trip. We escape those three characters as `~XX` (two lowercase hex
 * digits of the char code). The introducer is escaped FIRST so the transform is
 * reversible. All three are URL-path-safe both raw and escaped.
 */
const ESC = "~";

/** Escape a single filter value so it round-trips through the readable slug scheme. */
function escapeValue(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === ESC || ch === "." || ch === "_") {
      out += ESC + ch.charCodeAt(0).toString(16).padStart(2, "0");
    } else {
      out += ch;
    }
  }
  return out;
}

/** Reverse {@link escapeValue}: turn `~XX` sequences back into their characters. */
function unescapeValue(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === ESC && i + 2 < value.length) {
      const hex = value.slice(i + 1, i + 3);
      const code = parseInt(hex, 16);
      if (!Number.isNaN(code)) {
        out += String.fromCharCode(code);
        i += 2;
        continue;
      }
    }
    out += value[i];
  }
  return out;
}

/** The only part of `FilterValues` the slug codec reads. */
export interface FilterSlugInput {
  attributes: Record<string, string[]>;
  brands: string[];
}

/**
 * Encode attribute + brand filter values into a path-safe slug.
 * Format: `{group}.{val1}.{val2}_{group2}.{val1}` — dots join names+values within
 * a group, underscores separate groups. Groups are: attribute names (stripped of
 * `pa_`, e.g. `color`) and the reserved `brand` group. Groups and values are
 * sorted for determinism. Every value is delimiter-safe escaped (see
 * {@link escapeValue}). Returns an empty string when nothing is selected.
 */
export function encodeFilterSlug(filters: FilterSlugInput): string {
  const groups: { key: string; values: string[] }[] = [];

  for (const [slug, vals] of Object.entries(filters.attributes)) {
    if (vals.length === 0) continue;
    groups.push({ key: slug.replace(/^pa_/, ""), values: vals });
  }
  if (filters.brands.length > 0) {
    groups.push({ key: BRAND_GROUP_KEY, values: filters.brands });
  }

  return groups
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(
      ({ key, values }) =>
        `${key}.${[...values].sort().map(escapeValue).join(".")}`,
    )
    .join("_");
}

/**
 * Decoded filter slug: attribute key→values map (with `pa_` prefix restored)
 * plus the brand values. Replaces the prior flat `Record<string, string[]>`
 * shape so brand round-trips out of the path (06.1).
 */
export interface DecodedFilterSlug {
  attributes: Record<string, string[]>;
  brands: string[];
}

/**
 * Decode a slug produced by {@link encodeFilterSlug} back into attributes +
 * brands. Restores the `pa_` prefix on attribute names; routes the reserved
 * `brand` group into `brands`. Every value is unescaped. Returns empty
 * attributes + brands for an empty slug.
 */
export function decodeFilterSlug(slug: string): DecodedFilterSlug {
  const attributes: Record<string, string[]> = {};
  const brands: string[] = [];
  if (!slug) return { attributes, brands };

  for (const group of slug.split("_")) {
    const dotIdx = group.indexOf(".");
    if (dotIdx === -1) continue;
    const key = group.slice(0, dotIdx);
    const values = group
      .slice(dotIdx + 1)
      .split(".")
      .map(unescapeValue);
    if (!key || values.length === 0) continue;
    if (key === BRAND_GROUP_KEY) {
      brands.push(...values);
    } else {
      attributes[`pa_${key}`] = values;
    }
  }

  return { attributes, brands };
}
