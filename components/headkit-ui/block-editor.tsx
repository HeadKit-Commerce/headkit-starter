import "./../../app/_editorial/wp-block-library.css";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { BrandCarousel } from "@/components/headkit-ui/brand-carousel";
import { PostCarousel } from "@/components/headkit-ui/post/post-carousel";
import { ProjectCarousel } from "@/components/headkit-ui/project/project-carousel";
import { MainCarousel } from "@/components/headkit-ui/main-carousel";
import { sanitizeContent } from "@/lib/sanitize-content";
import type { ProcessedEditorBlock } from "@/lib/process-editor-blocks";
import type {
  Product,
  PostSummaryFieldsFragment,
  ProjectSummaryFieldsFragment,
  HeroCarouselItem,
} from "@headkit/sdk";

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

/** Read hydrated carousel nodes from attrs.carousels ({ nodes: [...] }). */
function hydrateHeroCarousels(raw: unknown): HeroCarouselItem[] {
  if (!raw || typeof raw !== "object") return [];
  const nodes = (raw as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(
    (n): n is HeroCarouselItem =>
      Boolean(n) && typeof n === "object" && "id" in (n as object),
  ) as HeroCarouselItem[];
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

function toProjectSummaries(
  projects: NonNullable<ProcessedEditorBlock["projects"]>,
): ProjectSummaryFieldsFragment[] {
  return projects.map((project) => ({
    __typename: "Project" as const,
    id: String(project.id ?? project.slug),
    title: project.title,
    slug: project.slug,
    excerpt: project.excerpt ?? "",
    date: project.date ?? "",
    uri: project.uri ?? `/projects/${project.slug}/`,
    location: project.location ?? null,
    featuredImage: project.featuredImage?.src
      ? {
          __typename: "Image" as const,
          src: project.featuredImage.src,
          alt: project.featuredImage.alt ?? project.title,
          width: project.featuredImage.width ?? 0,
          height: project.featuredImage.height ?? 0,
        }
      : null,
    brand: project.brand?.name
      ? {
          __typename: "ProjectBrand" as const,
          id: String(project.brand.id ?? project.brand.slug ?? ""),
          name: project.brand.name,
          slug: project.brand.slug ?? "",
          thumbnail: project.brand.thumbnail ?? "",
        }
      : null,
    tags: (project.tags ?? []).map((t) => ({
      __typename: "ProjectTag" as const,
      id: String(t.id ?? t.slug ?? ""),
      name: t.name ?? "",
      slug: t.slug ?? "",
      count: t.count ?? 0,
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
        if (
          data.cssClasses.includes("headkit-hilight") ||
          data.cssClasses.includes("headkit-callout")
        ) {
          const buttons =
            data.buttons && data.buttons.length > 0
              ? data.buttons
              : data.button
                ? [data.button]
                : [];
          return (
            <Callout
              key={index}
              title={data.title}
              content={data.description}
              buttons={buttons}
            />
          );
        }

        if (data.cssClasses.includes("headkit-hero-carousel")) {
          const nodes = hydrateHeroCarousels(data.attrs?.["carousels"]);
          if (nodes.length === 0) return null;
          // Unscheduled on purpose. This renderer runs inside the
          // homepage's `'use cache'` tree, and the request-time scheduler
          // cannot: `connection()` is illegal in a cached subtree. So the
          // WP hero-pattern path shows every slide regardless of its
          // start/end dates. Scheduling it needs this block hoisted out of
          // the cached tree, which is a larger change than this fix.
          return <MainCarousel key={index} carouselItems={nodes} />;
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
                      // Storefront catch-all — never absolute WP permalinks.
                      uri: `/collections/${c.slug}`,
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
          const brands = (data.brands ?? []).filter(
            (b) => typeof b.thumbnail === "string" && b.thumbnail.trim() !== "",
          );
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
                    Products → Brands and upload logos.
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

        if (data.cssClasses.includes("headkit-project-carousel")) {
          const projects = data.projects ?? [];
          if (projects.length === 0) return null;
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
                <ProjectCarousel projects={toProjectSummaries(projects)} />
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

interface CalloutProps {
  title: string;
  content: string;
  buttons: Array<{
    text?: string | null;
    url?: string | null;
    linkTarget?: string | null;
  }>;
}

/** Versatile callout / promo — title + body, then CTA button(s) on a row below. */
const Callout = ({ title, content, buttons }: CalloutProps) => {
  return (
    <div className="relative flex h-fit w-full flex-col gap-6 px-5 py-14 md:px-10">
      <div>
        <h2 className="mb-5 text-3xl font-semibold text-primary">{title}</h2>
        <div
          dangerouslySetInnerHTML={{ __html: content }}
          className="prose max-w-full text-primary"
        />
      </div>
      {buttons.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          {buttons.map((btn, i) => (
            <a
              key={`${btn.url ?? ""}-${btn.text ?? ""}-${i}`}
              href={btn.url ?? "#"}
              target={btn.linkTarget ?? undefined}
              className="inline-flex"
            >
              <Button variant="outline">{btn.text}</Button>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export { BlockEditor };
