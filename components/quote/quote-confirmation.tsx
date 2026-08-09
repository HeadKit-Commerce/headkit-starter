import Link from "next/link";
import {
  QuoteCartItems,
  type QuoteLineItem,
} from "@/components/quote/quote-cart-items";
import type { QuoteFormDetails } from "@/lib/quote-form";

export type QuoteConfirmationProps = {
  orderNumber: string;
  firstName: string;
  items: QuoteLineItem[];
  details: QuoteFormDetails;
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement | null {
  if (!value.trim()) return null;
  return (
    <div className="grid grid-cols-4 gap-2 font-medium text-base md:grid-cols-3 md:gap-4 md:text-lg">
      <div className="col-span-1 font-extrabold text-brand-fg">{label}</div>
      <div className="col-span-3 whitespace-pre-wrap text-brand-fg md:col-span-2">
        {value}
      </div>
    </div>
  );
}

/**
 * Quote confirmation — products left (no qty controls), quote details right.
 */
export function QuoteConfirmation({
  orderNumber,
  firstName,
  items,
  details,
}: QuoteConfirmationProps): React.ReactElement {
  return (
    <div className="px-5 pb-10 pt-10 md:px-10 md:pb-12 md:pt-16">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-medium tracking-tight text-brand-fg md:text-4xl">
          Thanks{firstName ? `, ${firstName}` : ""}!
        </h1>
        <p className="mt-3 text-base text-brand-fg/80 md:text-lg">
          Your quote request was submitted. We will follow up with pricing and
          assistance shortly.
        </p>
        <p className="mt-4 text-xl font-bold text-brand-fg">
          Quote #{orderNumber}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12">
        <aside className="md:order-1">
          <h2 className="mb-4 text-lg font-medium text-brand-fg">Your items</h2>
          <QuoteCartItems items={items} showQuantityControls={false} />
        </aside>

        <section className="md:order-2">
          <h2 className="mb-4 text-lg font-medium text-brand-fg">
            Quote details
          </h2>
          <div className="space-y-5">
            <DetailRow
              label="Name"
              value={`${details.firstName} ${details.lastName}`.trim()}
            />
            <DetailRow label="Email" value={details.email} />
            <DetailRow label="Phone" value={details.phone} />
            <DetailRow label="Company" value={details.company} />
            <DetailRow label="Industry" value={details.industry} />
            <DetailRow label="State" value={details.state} />
            <DetailRow label="Comments" value={details.comments} />
          </div>

          <div className="mt-10">
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-center text-sm font-medium text-on-primary hover:opacity-80 md:w-auto"
            >
              Continue browsing
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
