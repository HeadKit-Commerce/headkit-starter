import type { Post } from "@headkit/sdk";
import type { ItemList, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

interface CarouselPostJsonLDProps {
  posts: Post[];
}

export function CarouselPostJsonLD({ posts }: CarouselPostJsonLDProps) {
  const siteUrl = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

  const jsonLd: WithContext<ItemList> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: posts.map((post, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Article",
        headline: post.title,
        image: post.featuredImage?.src ?? "",
        url: `${siteUrl}${post.uri ?? `/news/${post.slug}/`}`,
        datePublished: post.date,
      },
    })),
  };

  return (
    <script
      id="carouselPostJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
