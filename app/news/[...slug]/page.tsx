import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import sanitize from "sanitize-html";
import { headkit as sdk } from "@/lib/sdk";
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
  return sdk.posts.get(postSlug);
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
      description: post.excerpt,
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
          datePublished={post.date}
          dateModified={post.modified}
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

          <div className="my-[40px] grid grid-cols-12 gap-2 md:gap-8 px-[20px] md:px-[40px]">
            <div className="col-span-12 md:col-span-9">
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitize(post.content) }}
              />
            </div>
          </div>

          {post.relatedPosts.length > 0 && (
            <div className="overflow-hidden px-5 md:px-10 py-[30px] lg:pt-[60px] lg:pb-[30px]">
              <SectionHeader
                title="Latest News"
                description="Get the latest news and updates from our blog."
                allButton="View All"
                allButtonPath="/news"
              />
              <div className="mt-5">
                <PostCarousel posts={post.relatedPosts} />
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
