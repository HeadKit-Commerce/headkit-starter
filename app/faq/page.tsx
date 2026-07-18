import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import sanitize from "sanitize-html";
import { headkit as sdk } from "@/lib/sdk";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQPageJsonLD } from "@/components/seo/faq-page-json-ld";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";

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

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [page] = await getFaqPage();
    if (!page?.seo) {
      return {
        title: "FAQ",
        robots: { index: false, follow: false },
      };
    }
    return makeSeoMetadata(page.seo, { title: page.title });
  } catch {
    return {
      title: "FAQ",
      robots: { index: false, follow: false },
    };
  }
}

export default async function FAQPage() {
  const [page, faqs] = await getFaqPage();

  return (
    <>
      {faqs.length > 0 && <FAQPageJsonLD items={faqs} />}

      <div className="px-5 md:px-10 py-10 md:py-16">
        <div>
          <div className="mb-12">
            <h1 className="mb-6 text-3xl font-bold text-purple-800">
              {page?.title ?? "Frequently Asked Questions"}
            </h1>
            {page?.content && (
              <div className="text-purple-800">
                <EditorialContent html={page.content} />
              </div>
            )}
          </div>

          {faqs.length > 0 ? (
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.id ?? index}
                  value={faq.id ?? index.toString()}
                  className="rounded-lg border border-purple-200 px-4"
                >
                  <AccordionTrigger className="text-left font-medium cursor-pointer">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div
                      className="prose text-purple-800 max-w-none pt-2"
                      dangerouslySetInnerHTML={{ __html: sanitize(faq.answer) }}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="rounded-lg border border-purple-200 px-6 py-12 text-center">
              <p className="text-lg font-medium text-purple-800">
                No FAQs published yet
              </p>
              <p className="mt-2 text-sm text-gray-800">
                Check back soon — answers to common questions will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
