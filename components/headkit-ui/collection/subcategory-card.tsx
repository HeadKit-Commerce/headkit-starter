import sanitize from "sanitize-html";
import { FeaturedImage } from "@/components/headkit-ui/featured-image";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import type { ProductCategoryDetail } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  subcategory: ProductCategoryDetail;
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
  priority = false,
}: Props): React.JSX.Element {
  // Always use the storefront catch-all route — WP `uri` can be an absolute
  // origin URL that would leave the Next.js app.
  const href = `/collections/${subcategory.slug}`;
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
      <h3 className="pt-3 text-[17px] text-primary transition-opacity group-hover:opacity-80">
        {name}
      </h3>
      {description ? (
        <p className="mt-1 line-clamp-2 text-sm text-gray-700">{description}</p>
      ) : null}
    </InstantLink>
  );
}
