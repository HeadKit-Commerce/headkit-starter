import type { Metadata } from "next";
import { notFound } from "next/navigation";
import sanitize from "sanitize-html";
import { headkit as sdk } from "@/lib/sdk";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

async function getPageData(slug: string[]) {
  const uri = `/${slug.join("/")}`;
  return sdk.pages.get(uri).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageData(slug);
  if (!page) {
    return { robots: { index: false, follow: false } };
  }
  // Real Yoast SEOData wins; when absent, emit a TEMPLATED page default
  // (title + per-entity description) rather than the old noindex-only
  // parent fallback — D-04 mandates a sane SEO floor, not a suppressed page.
  return makeSeoMetadata(page.seo ?? null, {
    title: page.title,
    description: seoFallbackDescription("page", page.title),
  });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = await getPageData(slug);

  if (!page) return notFound();

  // BreadcrumbList JSON-LD (D-04 core type) built from the page slug/title.
  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: page.title, href: `/${slug.join("/")}` },
  ];

  return (
    <div className="px-5 md:px-10 my-10 min-h-[50vh]">
      <BreadcrumbJsonLD items={breadcrumbItems} />
      <h1 className="font-extrabold text-3xl text-purple-800">{page.title}</h1>
      <div className="mt-5 grid grid-cols-12">
        <div className="prose col-span-12 md:col-span-9">
          <div dangerouslySetInnerHTML={{ __html: sanitize(page.content) }} />
        </div>
      </div>
    </div>
  );
}
