import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { FeaturedImageHeader } from "@/components/headkit-ui/post/featured-image-header";
import { PostCarousel } from "@/components/headkit-ui/post/post-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ArticleJsonLD } from "@/components/seo/article-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CarouselPostJsonLD } from "@/components/seo/carousel-post-json-ld";
import { makeSeoMetadata, resolveStoreName } from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";

interface Props {
  params: Promise<{ slug: string[] }>;
}

async function getPost(postSlug: string) {
  "use cache";
  cacheLife("max");
  cacheTag(`headkit:post:${postSlug}`, "headkit:posts");
  return sdk.content.get(postSlug, "POST");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug) return {};
  try {
    const [post, { seoSettings, storeSettings }, { iconUrl }] =
      await Promise.all([
        getPost(postSlug),
        getBranding(),
        getBrandingAssets(),
      ]);
    if (!post) return {};
    return makeSeoMetadata(post.seo, {
      title: post.title,
      ...(post.excerpt ? { description: post.excerpt } : {}),
      storeName: storeSettings.name ?? undefined,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
    });
  } catch {
    return {};
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug) return notFound();

  try {
    const [post, { storeSettings }] = await Promise.all([
      getPost(postSlug),
      getBranding(),
    ]);
    if (!post) return notFound();

    const related = post.relatedPosts ?? [];
    const siteName = resolveStoreName(storeSettings.name);

    const breadcrumbs = [
      { name: "Home", href: "/" },
      { name: "News", href: "/news" },
      { name: post.title, href: `/news/${postSlug}` },
    ];

    return (
      <>
        <ArticleJsonLD
          seo={post.seo}
          siteName={siteName}
          datePublished={post.date ?? undefined}
          dateModified={post.modified ?? undefined}
          image={post.featuredImage?.src}
          url={`${(process.env.NEXT_PUBLIC_FRONTEND_URL ?? "").replace(/\/$/, "")}/news/${postSlug}`}
        />
        <BreadcrumbJsonLD items={breadcrumbs} />
        {related.length > 0 && <CarouselPostJsonLD posts={related} />}

        <div>
          <FeaturedImageHeader
            title={post.title}
            image={post.featuredImage?.src ?? null}
          />

          {/* Full-width symmetric wrapper: EditorialContent centers its own
              blocks; .alignwide/.alignfull break out from viewport centre. */}
          <div className="my-[40px] px-[20px] md:px-[40px]">
            <EditorialContent html={post.content} />
          </div>

          {related.length > 0 && (
            <div className="overflow-hidden px-5 md:px-10 py-[30px] lg:pt-[60px] lg:pb-[30px]">
              <SectionHeader
                title="Latest News"
                description="Get the latest news and updates from our blog."
                allButton="View All"
                allButtonPath="/news"
              />
              <div className="mt-5">
                <PostCarousel posts={related} />
              </div>
            </div>
          )}
        </div>
      </>
    );
  } catch {
    return notFound();
  }
}
