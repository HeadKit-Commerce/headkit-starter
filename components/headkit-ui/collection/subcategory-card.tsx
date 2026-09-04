import sanitize from "sanitize-html";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  subcategory: ProductCategoryDetail;
  /**
   * The PARENT collection's canonical path (e.g. `/collections/clothing`).
   *
   * Required, and required for a reason: a child category's own payload carries
   * no ancestors, so a card that only knows its slug can only link
   * `/collections/{slug}` — the flat shape the collection route now 308s away
   * from. The parent is the one place the ancestry IS known, so it hands it
   * down rather than each card re-deriving it.
   */
  parentPath: string;
  /** First visible card is the LCP candidate on parent PLPs. */
  priority?: boolean;
}

function plainDescription(html: string): string {
  const stripped = sanitize(html, { allowedTags: [], allowedAttributes: {} });
  return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
}

/**
 * Subcategory image card shared by the SSR LCP slot and the client carousel.
 * Keep markup identical so the server-rendered first card matches the carousel.
 */
export function SubcategoryCard({
  subcategory,
  parentPath,
  priority = false,
}: Props): React.JSX.Element {
  // Always built from the storefront catch-all route, never from WP `uri` —
  // that can be an absolute origin URL that would leave the Next.js app. Nested
  // under the parent so the link names the category's canonical path.
  const href = `${parentPath}/${subcategory.slug}`;
  const name = decodeHtmlEntities(subcategory.name);
  const description = subcategory.description
    ? plainDescription(subcategory.description)
    : "";
  const thumbnail = subcategory.thumbnail?.trim() || null;

  return (
    <InstantLink href={href} pendingVariant="card" className="group block">
      <FeaturedImage
        src={thumbnail}
        alt={name}
        priority={priority}
        // Figma subcategory cards are landscape (~433×290 ≈ 3:2).
        className="aspect-[433/290] rounded-brand"
      />
      <h2 className="pt-3 text-[17px] text-primary transition-opacity group-hover:opacity-80">
        {name}
      </h2>
      {description ? (
        <p className="mt-1 line-clamp-2 text-sm text-gray-700">{description}</p>
      ) : null}
    </InstantLink>
  );
}
