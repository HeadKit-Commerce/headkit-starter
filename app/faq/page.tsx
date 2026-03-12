import type { Metadata } from "next";
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

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await sdk.pages.get("faq");
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
  const [page, faqs] = await Promise.all([
    sdk.pages.get("faq").catch(() => null),
    sdk.faq.list().catch(() => []),
  ]);

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
              <div
                className="prose text-purple-800 max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitize(page.content) }}
              />
            )}
          </div>

          {faqs.length > 0 && (
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
          )}
        </div>
      </div>
    </>
  );
}
