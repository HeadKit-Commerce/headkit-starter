import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GravityForm } from "@/components/gravity-form";
import {
  makeSeoMetadata,
  seoFallbackDescription,
  storefrontUrl,
} from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { env } from "@/lib/env";
import { getPageData } from "@/app/[...slug]/page";

/**
 * Wholesale is a WordPress page (slug `wholesale`), restored from history —
 * it was removed in 62fd2ae9 while stores' navigation and footer still link it.
 *
 * Recovered rather than re-authored, then reconciled with the sibling static
 * routes: the page read now goes through the shared `getPageData` used by
 * /contact, so the cache directive, life and tag cannot drift from it. The
 * original's `cacheLife("max")` is deliberately NOT kept — `max` pins a
 * `notFound()` for the life of the deployment, so a page published after the
 * first miss would stay 404 forever.
 *
 * The Gravity Forms id is configuration, not a literal: Dishee mounts its
 * enquiry form on /contact instead, and a per-store difference must not fork a
 * shared route. Unset → content renders with no form.
 */
const WHOLESALE_SLUG = "wholesale";

export async function generateMetadata(): Promise<Metadata> {
  const [page, { seoSettings, storeSettings }] = await Promise.all([
    getPageData(WHOLESALE_SLUG),
    getBranding(),
  ]);
  if (!page) {
    return {
      title: "Wholesale",
      robots: { index: false, follow: false },
    };
  }
  return makeSeoMetadata(page.seo ?? null, {
    title: page.title,
    description: seoFallbackDescription("page", page.title),
    canonical: storefrontUrl(`/${WHOLESALE_SLUG}`, storeSettings.domain),
    siteUrl: storeSettings.domain,
    allowIndexing: seoSettings.allowIndexing,
  });
}

export default async function WholesalePage(): Promise<React.ReactElement> {
  const page = await getPageData(WHOLESALE_SLUG);

  if (!page) {
    return notFound();
  }

  const formId = env.NEXT_PUBLIC_WHOLESALE_FORM_ID;

  return (
    <div className="px-5 py-10 md:px-10 md:py-16">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Left column — editorial content from WordPress */}
        <div>
          <h1 className="mb-6 text-3xl font-bold">{page.title}</h1>
          <EditorialContent html={page.content ?? ""} />
        </div>

        {/* Right column — enquiry form, only when this store configures one */}
        {formId ? (
          <div>
            <GravityForm formId={formId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
