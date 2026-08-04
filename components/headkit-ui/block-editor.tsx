import "./../../app/_editorial/wp-block-library.css";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { BrandCarousel } from "@/components/headkit-ui/brand-carousel";
import { PostCarousel } from "@/components/headkit-ui/post/post-carousel";
import { sanitizeContent } from "@/lib/sanitize-content";
import type { ProcessedEditorBlock } from "@/lib/process-editor-blocks";
import type { Product, PostSummaryFieldsFragment } from "@headkit/sdk";

interface Props {
  blocks: ProcessedEditorBlock[];
  /**
   * When set, only blocks with this `section` class are rendered.
   * When omitted, every block in `blocks` is rendered (document-order segments).
   */
  section?: string;
}

const MEDIA_CLASSES = [
  "headkit-embed",
  "headkit-gallery",
  "headkit-video-feature",
] as const;

function isMediaBlock(cssClasses: string[]): boolean {
  return MEDIA_CLASSES.some((cls) => cssClasses.includes(cls));
}

function toPostSummaries(
  posts: NonNullable<ProcessedEditorBlock["posts"]>,
): PostSummaryFieldsFragment[] {
  return posts.map((post) => ({
    __typename: "Post" as const,
    id: String(post.id ?? post.slug),
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    date: post.date ?? "",
    uri: post.uri ?? `/news/${post.slug}/`,
    featuredImage: post.featuredImage?.src
      ? {
          __typename: "Image" as const,
          src: post.featuredImage.src,
          alt: post.featuredImage.alt ?? post.title,
          width: post.featuredImage.width ?? 0,
          height: post.featuredImage.height ?? 0,
        }
      : null,
    categories: (post.categories ?? []).map((c) => ({
      __typename: "PostCategory" as const,
      id: c.id ?? c.slug ?? "",
      name: c.name ?? "",
      slug: c.slug ?? "",
      count: 0,
    })),
  }));
}

const BlockEditor = ({ blocks, section }: Props) => {
  const result =
    section === undefined
      ? blocks
      : blocks?.filter((block) => block.section === section);
  return (
    <>
      {result?.map((data: ProcessedEditorBlock, index: number) => {
        if (data.cssClasses.includes("headkit-hilight")) {
          return (
            <AboutUs
              key={index}
              title={data.title}
              content={data.description}
              buttonText={data.button?.text}
              buttonLink={data.button?.url}
              buttonTarget={data.button?.linkTarget}
            />
          );
        }

        if (data.cssClasses.includes("headkit-product-carousel")) {
          const products: Product[] = data.products ?? [];
          if (products.length === 0) return null;
          return (
            <div className="py-[30px] overflow-hidden" key={index}>
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                <ProductCarousel products={products} />
              </div>
            </div>
          );
        }

        if (data.cssClasses.includes("headkit-category-carousel")) {
          const categories = data.categories ?? [];
          return (
            <div className="py-[30px] overflow-hidden" key={index}>
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                {categories.length > 0 ? (
                  <CategoryCarousel
                    categories={categories.map((c) => ({
                      name: c.name,
                      slug: c.slug,
                      uri: c.uri ?? `/shop/categories/${c.slug}`,
                      thumbnail: c.thumbnail ?? "",
                    }))}
                  />
                ) : (
                  <p className="px-5 md:px-10 text-sm text-neutral-500">
                    No categories to display yet. Mark categories Featured under
                    Products → Categories, or pick them in the Handpicked
                    Categories block.
                  </p>
                )}
              </div>
            </div>
          );
        }

        if (data.cssClasses.includes("headkit-brand-carousel")) {
          const brands = data.brands ?? [];
          return (
            <div className="py-[30px] overflow-hidden" key={index}>
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                {brands.length > 0 ? (
                  <BrandCarousel
                    brands={brands.map((b) => ({
                      name: b.name,
                      slug: b.slug,
                      thumbnail: b.thumbnail ?? "",
                    }))}
                  />
                ) : (
                  <p className="px-5 md:px-10 text-sm text-neutral-500">
                    No brands to display yet. Mark brands Featured under
                    Products → Brands, or upload brand logos.
                  </p>
                )}
              </div>
            </div>
          );
        }

        if (data.cssClasses.includes("headkit-post-carousel")) {
          const posts = data.posts ?? [];
          if (posts.length === 0) return null;
          return (
            <div className="py-[30px] overflow-hidden" key={index}>
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                <PostCarousel posts={toPostSummaries(posts)} />
              </div>
            </div>
          );
        }

        if (isMediaBlock(data.cssClasses) || data.html) {
          const clean = sanitizeContent(data.html ?? "");
          if (!clean.trim()) return null;

          const isVideoFeature = data.cssClasses.includes(
            "headkit-video-feature",
          );

          return (
            <div
              key={index}
              className={
                isVideoFeature
                  ? "hk-section-content headkit-video-feature-wrap overflow-hidden"
                  : "hk-section-content px-5 md:px-10 py-10 overflow-hidden"
              }
            >
              <div
                className="wp-block-content prose max-w-none"
                dangerouslySetInnerHTML={{ __html: clean }}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
};

interface AboutUsProps {
  title: string;
  content: string;
  buttonText: string | null | undefined;
  buttonLink: string | null | undefined;
  buttonTarget: string | null | undefined;
}

const AboutUs = ({
  title,
  content,
  buttonText,
  buttonLink,
  buttonTarget,
}: AboutUsProps) => {
  return (
    <div className="relative grid h-fit w-full grid-cols-1 gap-8 px-5 md:px-10 py-14 md:grid-cols-3">
      <div className="md:col-span-2">
        <h1 className="mb-5 text-3xl font-semibold text-primary">{title}</h1>
        <div
          dangerouslySetInnerHTML={{ __html: content }}
          className="prose text-primary max-w-full"
        />
      </div>
      <div className="flex items-center">
        <a
          href={buttonLink ?? "#"}
          target={buttonTarget ?? ""}
          className="w-full"
        >
          <Button variant="outline" fullWidth>
            {buttonText}
          </Button>
        </a>
      </div>
    </div>
  );
};

export { BlockEditor };
