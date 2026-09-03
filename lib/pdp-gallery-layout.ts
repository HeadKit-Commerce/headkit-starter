/**
 * Built-in PDP image gallery layouts. Persisted on store branding
 * (`pdpGalleryLayout`) and coerced here so an empty / unknown value still
 * renders today's masonry grid.
 */

export const PDP_GALLERY_LAYOUTS = [
  "grid",
  "thumbnails",
  "carousel",
  "stack",
] as const;

export type PdpGalleryLayout = (typeof PDP_GALLERY_LAYOUTS)[number];

export const DEFAULT_PDP_GALLERY_LAYOUT: PdpGalleryLayout = "grid";

const KNOWN = new Set<string>(PDP_GALLERY_LAYOUTS);

/**
 * Coerce a persisted or GraphQL gallery value to one of the four built-in
 * layouts. Empty / unknown strings become `grid`.
 */
export function resolvePdpGalleryLayout(
  value: string | null | undefined,
): PdpGalleryLayout {
  const trimmed = value?.trim() ?? "";
  return KNOWN.has(trimmed)
    ? (trimmed as PdpGalleryLayout)
    : DEFAULT_PDP_GALLERY_LAYOUT;
}
