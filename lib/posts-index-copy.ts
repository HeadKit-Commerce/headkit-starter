import type { PostsIndexCopy } from "@/lib/store-theme";

const FALLBACK_TITLE = "News";
const FALLBACK_DESCRIPTION =
  "Stay up to date with our latest news and articles.";

/** Landing fields the posts index needs. Extra SDK fields are ignored. */
export interface PostsLandingHeading {
  title?: string | null;
  content?: string | null;
  seo?: {
    title?: string | null;
    metaDesc?: string | null;
  } | null;
}

export interface PostsIndexHeading {
  title: string;
  /** HTML body from the provider posts page. Absent when the intro is plain text. */
  content?: string;
  description: string;
}

/**
 * Posts index heading.
 *
 * A provider posts page (WooCommerce Settings → Reading, or a Shopify page
 * whose handle equals the posts base) supplies the title and HTML body when
 * that page has visible text or its own SEO fields. Otherwise a customer
 * `copy.postsIndex` string replaces the blog name, then the starter "News"
 * fallback.
 */
export function postsIndexHeading(
  landing: PostsLandingHeading | null | undefined,
  copy: PostsIndexCopy | undefined,
): PostsIndexHeading {
  const pageContent = landing?.content?.trim() ?? "";
  const pageTitle = landing?.title?.trim() ?? "";
  const seoTitle = landing?.seo?.title?.trim() ?? "";
  const seoDescription = landing?.seo?.metaDesc?.trim() ?? "";
  const fromPage =
    pageContent.length > 0 || seoTitle.length > 0 || seoDescription.length > 0;
  const themeTitle = copy?.title?.trim() ?? "";
  const themeDescription = copy?.description?.trim() ?? "";
  const title =
    (fromPage ? pageTitle : "") || themeTitle || pageTitle || FALLBACK_TITLE;
  const description =
    seoDescription || themeDescription || FALLBACK_DESCRIPTION;
  if (pageContent.length > 0) {
    return { title, content: pageContent, description };
  }
  return { title, description };
}
