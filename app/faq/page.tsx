import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { FAQPageJsonLD } from "@/components/seo/faq-page-json-ld";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { FaqList } from "@/components/headkit-ui/faq-list";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

async function getFaqPage() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:page:faq", "headkit:pages");
  // NOTE: sdk.faq.list() errors intentionally propagate (no `.catch(() => [])`).
  // Swallowing them cached "no FAQs" with cacheLife("max") — a transient fetch
  // failure rendered a permanently blank page. A rejected fetch now bubbles to
  // app/error.tsx ("Something went wrong" + Try again) and the failed result is
  // NOT written to the cache, so the next request retries.
  return Promise.all([
    sdk.content.get("faq", "PAGE").catch(() => null),
    sdk.faq.list(),
  ]);
}

/**
 * Empty Yoast/CMS SEO must not hide FAQ from indexing by default.
 * Robots still respect store allowIndexing + non-production via resolveRobots.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const [[page], { seoSettings, storeSettings }] = await Promise.all([
      getFaqPage(),
      getBranding(),
    ]);
    return makeSeoMetadata(page?.seo ?? null, {
      title: page?.title?.trim() || "FAQ",
      description:
        "Frequently asked questions — answers about orders, shipping, and more.",
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: SITE_URL ? `${SITE_URL.replace(/\/$/, "")}/faq` : "/faq",
    });
  } catch {
    return makeSeoMetadata(null, {
      title: "FAQ",
      description:
        "Frequently asked questions — answers about orders, shipping, and more.",
    });
  }
}

export default async function FAQPage() {
  const [page, faqs] = await getFaqPage();
  const title = page?.title?.trim() || "FAQ";

  return (
    <>
      {faqs.length > 0 && <FAQPageJsonLD items={faqs} />}

      <div className="px-5 py-10 md:px-10 md:py-14">
        <header className="mb-10 max-w-md md:mb-14">
          <h1 className="mb-4 text-3xl font-bold text-primary md:text-4xl">
            {title}
          </h1>
          {page?.content ? (
            <div className="text-base text-primary [&_.prose]:text-base [&_p]:text-base [&_p]:leading-normal">
              <EditorialContent html={page.content} />
            </div>
          ) : null}
        </header>

        {faqs.length > 0 ? (
          <FaqList faqs={faqs} />
        ) : (
          <div className="max-w-md py-8">
            <p className="text-lg font-medium text-primary">
              No FAQs published yet
            </p>
            <p className="mt-2 text-sm text-gray-800">
              Check back soon — answers to common questions will appear here.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
