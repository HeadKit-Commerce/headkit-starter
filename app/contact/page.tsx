import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import sanitize from "sanitize-html";
import { headkit as sdk } from "@/lib/sdk";
import { makeSeoMetadata } from "@/lib/make-metadata";

async function getContactPage() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:page:contact", "headkit:pages");
  return sdk.pages.get("contact");
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getContactPage();
    if (!page?.seo) {
      return {
        title: "Contact Us",
        robots: { index: false, follow: false },
      };
    }
    return makeSeoMetadata(page.seo, { title: page.title });
  } catch {
    return {
      title: "Contact Us",
      robots: { index: false, follow: false },
    };
  }
}

export default async function ContactPage() {
  const page = await getContactPage().catch(() => null);

  return (
    <div className="px-5 md:px-10 py-10 md:py-16">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h1 className="mb-6 text-3xl font-bold text-purple-800">
            {page?.title ?? "Contact Us"}
          </h1>
          {page?.content && (
            <div
              className="prose text-purple-800 max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitize(page.content) }}
            />
          )}
        </div>

        <div>
          <div className="rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-muted-foreground">
              Contact form powered by Gravity Forms plugin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
