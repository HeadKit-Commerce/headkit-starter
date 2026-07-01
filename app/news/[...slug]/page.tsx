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
import { makeSeoMetadata } from "@/lib/make-metadata";

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
    const post = await getPost(postSlug);
    if (!post) return {};
    return makeSeoMetadata(post.seo, {
      title: post.title,
      ...(post.excerpt ? { description: post.excerpt } : {}),
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
    const post = await getPost(postSlug);
    if (!post) return notFound();

    const related = post.relatedPosts ?? [];

    const breadcrumbs = [
      { name: "Home", uri: "/" },
      { name: "News", uri: "/news" },
      { name: post.title, uri: `/news/${postSlug}` },
    ];

    return (
      <>
        <ArticleJsonLD
          seo={post.seo}
          siteName={process.env.NEXT_PUBLIC_SITE_NAME ?? ""}
          datePublished={post.date ?? undefined}
          dateModified={post.modified ?? undefined}
          image={post.featuredImage?.src}
        />
        <BreadcrumbJsonLD
          items={breadcrumbs.map((b, i) => ({
            name: b.name,
            href: b.uri,
            current: i === breadcrumbs.length - 1,
          }))}
        />

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
