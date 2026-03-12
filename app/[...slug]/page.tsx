import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import sanitize from "sanitize-html";
import { headkit as sdk } from "@/lib/sdk";
import { makeSeoMetadata } from "@/lib/make-metadata";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

async function getPageData(slug: string[]) {
  const uri = `/${slug.join("/")}`;
  return sdk.pages.get(uri).catch(() => null);
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  try {
    const page = await getPageData(slug);
    if (!page?.seo) throw new Error("no seo");
    return makeSeoMetadata(page.seo, { title: page.title });
  } catch {
    const parentMeta = await parent;
    return {
      title: parentMeta.title,
      description: parentMeta.description,
      robots: { index: false, follow: false },
    };
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = await getPageData(slug);

  if (!page) return notFound();

  return (
    <div className="px-5 md:px-10 my-10 min-h-[50vh]">
      <h1 className="font-extrabold text-3xl text-purple-800">{page.title}</h1>
      <div className="mt-5 grid grid-cols-12">
        <div className="prose col-span-12 md:col-span-9">
          <div dangerouslySetInnerHTML={{ __html: sanitize(page.content) }} />
        </div>
      </div>
    </div>
  );
}
