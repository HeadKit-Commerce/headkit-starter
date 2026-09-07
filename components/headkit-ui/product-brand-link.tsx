import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { decodeHtmlEntities } from "@/lib/utils";

export interface ProductBrandLinkProps {
  /** Resolved display brand; render nothing when the product has none. */
  brand?:
    | { name: string; slug: string; logoUrl?: string | null | undefined }
    | null
    | undefined;
  className?: string;
}

/**
 * Brand logo (or name) above the PDP title, linking to the brand's PLP.
 *
 * Renders NOTHING without a brand, so a store whose products carry no
 * `product_brand` terms — or whose payload predates the `brands` selection —
 * sees the title exactly where it was. With a brand but no logo the name is
 * rendered as the link text, so the link is never an empty box.
 *
 * `.headkit-product-brand` is the CSS hook for store overrides (logo height,
 * alignment), the same convention as `.headkit-product-detail`.
 */
export function ProductBrandLink({
  brand,
  className,
}: ProductBrandLinkProps): React.ReactElement | null {
  if (!brand || brand.slug.trim() === "" || brand.name.trim() === "") {
    return null;
  }
  const name = decodeHtmlEntities(brand.name);
  const href = `/brand/${brand.slug}`;
  return (
    <Link
      href={href}
      className={cn(
        "headkit-product-brand mb-3 inline-flex items-center",
        className,
      )}
      data-testid="product-brand-link"
      aria-label={`View all ${name} products`}
    >
      {brand.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt={name}
          width={160}
          height={48}
          sizes="160px"
          className="h-12 w-auto max-w-[10rem] object-contain object-left"
        />
      ) : (
        <span className="text-sm font-medium uppercase tracking-wide text-primary">
          {name}
        </span>
      )}
    </Link>
  );
}
