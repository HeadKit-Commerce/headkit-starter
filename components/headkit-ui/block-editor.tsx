import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { BrandCarousel } from "@/components/headkit-ui/brand-carousel";
import { ClientCarousel } from "@/components/headkit-ui/client-carousel";
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
import { getBranding } from "@/lib/branding";
import { collectionPathResolver } from "@/lib/collection-path";
import {
  filterCategoriesByNonEmptySlugs,
  getNonEmptyCollectionSlugs,
} from "@/lib/hide-empty-collections";
import { resolveCarouselProductsFromHtml } from "@/lib/resolve-carousel-products-from-html";
import { getStoreTheme } from "@/lib/store-theme";

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

/** productColourways map from handpicked-products (product ID → colourway). */
function hydrateColourwayPins(
  raw: unknown,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string" || !value.trim()) continue;
    const id = String(key).trim();
    if (!id) continue;
    out[id] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
    // Prefer WordPress `uri` (Posts-page slug). Fallback keeps listings working
    // before theme ≥0.4.49 ships dynamic base paths.
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

const BlockEditor = async ({
  blocks,
  section,
}: Props): Promise<React.JSX.Element> => {
  const result =
    section === undefined
      ? blocks
      : blocks?.filter((block) => block.section === section);

  // WP media / raw HTML blocks need block-library CSS; HeadKit React
  // carousels do not — keep the ~153KB stylesheet off commerce-only homes.
  const needsEditorialCss = (result ?? []).some(
    (data) => isMediaBlock(data.cssClasses) || Boolean(data.html?.trim()),
  );
  if (needsEditorialCss) {
    await import("@/components/headkit-ui/editorial-styles");
  }

  const { branding } = await getBranding();
  const heroLayout = getStoreTheme().layout.heroLayout;
  const nonEmptySlugs = branding.hideEmptyCollections
    ? await getNonEmptyCollectionSlugs()
    : null;
  // Handpicked category blocks carry a slug and no ancestry, so the canonical
  // nested path is resolved from the category tree (one cached read).
  //
  // GATED on a category block actually being present, the same `.some(...)`
  // shape `needsEditorialCss` uses above, and for a sharper reason than the
  // round trip it saves. `collectionPathIndex` carries `cacheTag(TAG.collections)`,
  // and Next propagates a nested entry's tags outward — so resolving
  // unconditionally would subscribe EVERY surface that renders a `BlockEditor`
  // (every CMS page, `/contact`, every news post) to the tag WordPress fires on
  // any product or category change, where those routes previously subscribed
  // only to `TAG.page(slug)` / `TAG.pages` / `TAG.posts`. Widening a purge's
  // blast radius that way is a known hazard here — see `lib/cache-tags.ts`
  // ("NEVER a route/page tag (Bike Society incident)") and `app/sitemap.ts`
  // ("each extra tag widens the purge blast radius").
  const hasCategoryBlock = (result ?? []).some((data) =>
    data.cssClasses.includes("headkit-category-carousel"),
  );
  const collectionPath = hasCategoryBlock
    ? await collectionPathResolver()
    : null;

  return (
    <>
      {result?.map((data: ProcessedEditorBlock, index: number) => {
        if (data.cssClasses.includes("headkit-category-carousel")) {
          const rawCategories = data.categories ?? [];
          const categories = nonEmptySlugs
            ? filterCategoriesByNonEmptySlugs(rawCategories, nonEmptySlugs)
            : rawCategories;
          return (
            <div
              className="headkit-category-carousel overflow-hidden py-10"
              key={index}
            >
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-8">
                {categories.length > 0 ? (
                  <CategoryCarousel
                    categories={categories.map((c) => ({
                      name: c.name,
                      slug: c.slug,
                      // Storefront catch-all — never absolute WP permalinks —
                      // and the category's CANONICAL path, so a handpicked
                      // subcategory tile does not link the flat shape the
                      // collection route 308s away from.
                      uri: collectionPath?.(c.slug) ?? "",
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

        // Continue with remaining block types below — category carousel handled above.
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
          return (
            <MainCarousel
              key={index}
              carouselItems={nodes}
              heroLayout={heroLayout}
            />
          );
        }

        if (data.cssClasses.includes("headkit-product-carousel")) {
          const colourwayPins = hydrateColourwayPins(
            data.attrs?.["productColourways"],
          );
          return (
            <HeadKitProductCarouselSection
              key={index}
              title={data.title}
              description={data.description}
              button={data.button}
              products={data.products ?? []}
              html={data.html}
              colourwayPins={colourwayPins}
            />
          );
        }

        if (data.cssClasses.includes("headkit-brand-carousel")) {
          const brands = (data.brands ?? []).filter(
            (b) => typeof b.thumbnail === "string" && b.thumbnail.trim() !== "",
          );
          return (
            <div
              className="headkit-brand-carousel overflow-hidden py-10"
              key={index}
            >
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-8">
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

        if (data.cssClasses.includes("headkit-client-carousel")) {
          const clients = (data.clients ?? []).filter(
            (c) => typeof c.thumbnail === "string" && c.thumbnail.trim() !== "",
          );
          return (
            <div
              className="headkit-client-carousel overflow-hidden py-10"
              key={index}
            >
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-8">
                {clients.length > 0 ? (
                  <ClientCarousel
                    clients={clients.map((c) => ({
                      name: c.name,
                      slug: c.slug,
                      thumbnail: c.thumbnail ?? "",
                      ...(typeof c.projectCount === "number"
                        ? { projectCount: c.projectCount }
                        : {}),
                      ...(c.singleProjectSlug !== undefined
                        ? { singleProjectSlug: c.singleProjectSlug }
                        : {}),
                      ...(c.uri !== undefined ? { uri: c.uri } : {}),
                    }))}
                  />
                ) : (
                  <p className="px-5 md:px-10 text-sm text-neutral-500">
                    No clients to display yet. Add Clients under Clients and
                    upload logos.
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
            <div
              className="headkit-post-carousel overflow-hidden py-10"
              key={index}
            >
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-8">
                <PostCarousel posts={toPostSummaries(posts)} />
              </div>
            </div>
          );
        }

        if (data.cssClasses.includes("headkit-project-carousel")) {
          const projects = data.projects ?? [];
          if (projects.length === 0) return null;
          return (
            <div
              className="headkit-project-carousel overflow-hidden py-10"
              key={index}
            >
              <SectionHeader
                title={data.title}
                description={data.description}
                allButton={data.button?.text ?? ""}
                allButtonPath={data.button?.url ?? ""}
                className="px-5 md:px-10"
              />
              <div className="mt-8">
                <ProjectCarousel projects={toProjectSummaries(projects)} />
              </div>
            </div>
          );
        }

        if (isMediaBlock(data.cssClasses) || data.html) {
          return (
            <SanitizedMediaHtml
              key={index}
              html={data.html ?? ""}
              cssClasses={data.cssClasses}
            />
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

/**
 * Homepage-matching product carousel shell. When GraphQL/theme hydration has
 * not attached products yet, resolve slugs from WC handpicked markup in the
 * section HTML — always SectionHeader + ProductCarousel (never a static grid).
 */
async function HeadKitProductCarouselSection({
  title,
  description,
  button,
  products: hydratedProducts,
  html,
  colourwayPins,
}: {
  title: string;
  description: string;
  button?: { text?: string | null; url?: string | null } | null | undefined;
  products: Product[];
  html?: string | null | undefined;
  colourwayPins?: Record<string, string> | undefined;
}): Promise<React.JSX.Element | null> {
  let products = hydratedProducts;
  let pins = colourwayPins;

  if (products.length === 0 && html?.trim()) {
    const resolved = await resolveCarouselProductsFromHtml(html);
    products = resolved.products;
    if (!pins || Object.keys(pins).length === 0) {
      pins = resolved.colourwayPins;
    }
  }

  if (products.length === 0) return null;

  return (
    <div className="headkit-product-carousel overflow-x-clip py-10">
      <SectionHeader
        title={title}
        description={description}
        allButton={button?.text ?? ""}
        allButtonPath={button?.url ?? ""}
        className="px-5 md:px-10"
      />
      <div className="mt-8">
        <ProductCarousel products={products} colourwayPins={pins} />
      </div>
    </div>
  );
}

/**
 * Media / raw HTML block — sanitize must be awaited (and runs under
 * `"use cache"`), so this is a child async Server Component rather than
 * work inside the sync `.map` callback.
 */
async function SanitizedMediaHtml({
  html,
  cssClasses,
}: {
  html: string;
  cssClasses: string[];
}): Promise<React.JSX.Element | null> {
  const clean = await sanitizeContent(html);
  if (!clean.trim()) return null;

  const isVideoFeature = cssClasses.includes("headkit-video-feature");
  const isGallery = cssClasses.includes("headkit-gallery");
  const isEmbed = cssClasses.includes("headkit-embed");

  const mediaHook = isVideoFeature
    ? "headkit-video-feature-wrap"
    : isGallery
      ? "headkit-gallery"
      : isEmbed
        ? "headkit-embed"
        : "headkit-media";

  return (
    <div
      className={
        isVideoFeature
          ? `hk-section-content ${mediaHook} overflow-hidden`
          : `hk-section-content ${mediaHook} px-5 md:px-10 py-10 overflow-hidden`
      }
    >
      <div
        className="wp-block-content prose max-w-none"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </div>
  );
}

/**
 * Versatile callout / promo — boxed with page inset, content in the middle
 * 6 columns on desktop. Primary CTA is solid; secondary is outline.
 */
const Callout = ({ title, content, buttons }: CalloutProps) => {
  return (
    <div className="headkit-callout-section px-5 py-10 md:px-10">
      <div className="headkit-callout rounded-brand border border-gray-200 px-6 py-10 md:px-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="flex flex-col gap-6 md:col-span-6 md:col-start-4">
            <div>
              <h2 className="mb-5 text-primary">{title}</h2>
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
                    <Button variant={i === 0 ? "default" : "outline"}>
                      {btn.text}
                    </Button>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export { BlockEditor };
