"use client";

import sanitize from "sanitize-html";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FaqItem } from "@headkit/sdk";

interface FaqListProps {
  faqs: FaqItem[];
}

export function FaqList({ faqs }: FaqListProps): React.JSX.Element {
  const mid = Math.ceil(faqs.length / 2);
  const left = faqs.slice(0, mid);
  const right = faqs.slice(mid);

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-2 md:grid-cols-2">
      <FaqColumn items={left} />
      {right.length > 0 ? <FaqColumn items={right} /> : null}
    </div>
  );
}

function FaqColumn({ items }: { items: FaqItem[] }): React.JSX.Element {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((faq, index) => (
        <AccordionItem
          key={faq.id ?? index}
          value={faq.id ?? `faq-${index}`}
          className="border-0"
        >
          <AccordionTrigger
            icon="plus-minus"
            className="gap-4 cursor-pointer py-3 text-left text-xl font-bold text-primary no-underline hover:no-underline hover:opacity-80 md:text-2xl"
          >
            <span className="pr-2">{faq.question}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 pt-0">
            <div
              className="max-w-md text-base leading-normal text-gray-800 prose prose-p:my-0"
              dangerouslySetInnerHTML={{ __html: sanitize(faq.answer) }}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
