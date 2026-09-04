"use server";

import { headkit } from "@/lib/sdk";
import { cmsSlugFromSizeGuideHref } from "@/lib/size-guide-href";

/**
 * Load a Size Guide CMS page's HTML for the PDP modal.
 *
 * Kept as a server action (not called from ProductPageContent) so
 * `TAG.pages` does not attach to every product route cache entry.
 */
export async function getSizeGuidePageHtml(href: string): Promise<string> {
  const slug = cmsSlugFromSizeGuideHref(href);
  if (!slug) {
    return "";
  }
  try {
    const page = await headkit.content.get(slug, "PAGE");
    return page?.content?.trim() ?? "";
  } catch {
    return "";
  }
}
