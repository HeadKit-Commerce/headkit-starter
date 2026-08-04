import type { Post } from "@headkit/sdk";
import type { ItemList, WithContext } from "schema-dts";
import { safeJsonLdStringify } from "./safe-json-ld";

interface CarouselPostJsonLDProps {
  posts: Array<
    Pick<Post, "title" | "slug" | "date"> & {
      uri?: string | null;
      featuredImage?: { src?: string | null } | null;
    }
  >;
}

export function CarouselPostJsonLD({ posts }: CarouselPostJsonLDProps) {
  const siteUrl = (process.env.NEXT_PUBLIC_FRONTEND_URL ?? "").replace(
    /\/$/,
    "",
  );

  const jsonLd: WithContext<ItemList> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: posts.map((post, index) => {
      const path = post.uri?.startsWith("/") ? post.uri : `/news/${post.slug}/`;
      const url = post.uri?.startsWith("http") ? post.uri : `${siteUrl}${path}`;
      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Article",
          headline: post.title,
          image: post.featuredImage?.src ?? "",
          url,
          datePublished: post.date,
        },
      };
    }),
  };

  return (
    <script
      id="carouselPostJsonLD"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
