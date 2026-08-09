"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Empty quote state — same copy/CTA as the empty cart drawer in quote mode.
 */
export function QuoteEmpty(): React.ReactElement {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-fg">
      <div className="px-5 py-10 md:px-10 md:py-16">
        <header className="mb-10 max-w-2xl">
          <h1 className="text-3xl font-medium tracking-tight text-brand-fg md:text-4xl">
            Quote
          </h1>
        </header>

        <div className="max-w-lg">
          <p className="mb-4 text-base text-brand-fg md:text-lg">
            No products in your quote yet.
          </p>
          <p className="mb-10 text-base font-medium text-brand-fg md:text-lg">
            Browse our selection and add products to request pricing.
          </p>
          <Link href="/shop">
            <Button
              className="shadow-none focus-visible:ring-0"
              rightIcon="arrowRight"
            >
              Browse collections
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
