import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { GravityForm } from "@/components/gravity-form";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";

const WHOLESALE_SLUG = "wholesale";

/** Gravity Forms form ID for the wholesale inquiry form. */
const WHOLESALE_FORM_ID = "2";

async function getWholesalePage() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:page:wholesale", "headkit:pages");
  return sdk.content.get(WHOLESALE_SLUG, "PAGE");
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getWholesalePage();
    if (!page?.seo) {
      return {
        title: "Wholesale",
        robots: { index: false, follow: false },
      };
    }
    return makeSeoMetadata(page.seo, {
      title: page.title ?? undefined,
      description: page.seo?.metaDesc ?? undefined,
    });
  } catch {
    return {
      title: "Wholesale",
      robots: { index: false, follow: false },
    };
  }
}

export default async function Page() {
  const page = await getWholesalePage();

  if (!page) {
    return notFound();
  }

  return (
    <div className="px-5 md:px-10 py-10 md:py-16">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Left Column — Content */}
        <div>
          <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
          <EditorialContent html={page.content} />
        </div>

        {/* Right Column — Inquiry Form */}
        <div>
          <GravityForm formId={WHOLESALE_FORM_ID} />
        </div>
      </div>
    </div>
  );
}
