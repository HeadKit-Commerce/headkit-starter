/**
 * Detect a homepage hero that shipped before Shopify finished resolving
 * file_reference media. The storefront caches Home for `days`; Shopify has no
 * files/update webhook after video transcode, so an empty-media prerender would
 * otherwise stick until the next catalog edit or deploy.
 */

export type HomepageHeroSlideMedia = {
  title?: string | null;
  header?: string | null;
  buttonText?: string | null;
  image?: string | null;
  mobileImage?: string | null;
  video?: string | null;
  mobileVideo?: string | null;
};

export type HomepageHeroMediaSource = {
  carousels?: ReadonlyArray<HomepageHeroSlideMedia> | null;
} | null;

function nonempty(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * True when at least one carousel slide has shopper-facing copy but no media
 * URL. Those slides are still processing (or unpublished) — do not pin them
 * under the homepage `days` backstop.
 */
export function homepageHeroMediaPending(
  homepage: HomepageHeroMediaSource,
): boolean {
  for (const slide of homepage?.carousels ?? []) {
    const hasCopy =
      nonempty(slide.header) ||
      nonempty(slide.title) ||
      nonempty(slide.buttonText);
    if (!hasCopy) {
      continue;
    }
    const hasMedia =
      nonempty(slide.image) ||
      nonempty(slide.mobileImage) ||
      nonempty(slide.video) ||
      nonempty(slide.mobileVideo);
    if (!hasMedia) {
      return true;
    }
  }
  return false;
}

/** Cache Components profile while hero media URLs are still empty. */
export const HOMEPAGE_PENDING_HERO_CACHE_LIFE = "minutes" as const;
