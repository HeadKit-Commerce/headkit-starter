import type { Metadata } from "next";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import {
  makeSeoMetadata,
  seoFallbackDescription,
  storefrontUrl,
} from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { errorFields, logger } from "@/lib/logger";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CmsPageBody } from "@/components/headkit-ui/cms-page-body";
import { withGuaranteedFormMarker } from "@/lib/gravity-form-content";
import { getPageData } from "@/app/[...slug]/page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Contact is a WordPress page (slug `contact`), not a hardcoded storefront
 * route. Editors place copy + Gravity Forms in a WP Columns layout; the theme
 * emits a `.headkit-gravity-form` marker and EditorialContent hydrates the
 * React form in place (no React 2-column override).
 *
 * Seed: docker/wordpress/seed-starter-content.php embeds a wide Columns block
 * with `[gravityform id="1"]` when GF form 1 (Contact) exists. Product enquiry
 * on the PDP still uses form id 3 — see ENQUIRY_FORM_ID in product-detail.tsx.
 */
const CONTACT_SLUG = "contact";

/**
 * Form rendered when the WordPress Contact page places none of its own.
 * Matches the seed (`docker/wordpress/seed-gravity-forms.php` creates
 * 1 = Contact) and the id the old storefront's /contact route hardcoded.
 */
const CONTACT_FORM_ID = "1";

function ContactFormFallback(): React.ReactElement {
  return (
    <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
      <p>Our contact form is currently unavailable.</p>
      <p className="mt-2">
        Please email us at{" "}
        <a
          className="font-medium text-primary underline"
          href="mailto:hello@example.com"
        >
          hello@example.com
        </a>{" "}
        and we&apos;ll get back to you.
      </p>
    </div>
  );
}

/**
 * The Contact page read, with this route's own tolerance for a CMS outage.
 *
 * `getPageData` returns null ONLY for a page that genuinely does not exist and
 * PROPAGATES a transport failure, which is what stops `/wholesale` and the CMS
 * catch-all baking a sticky 404 into their route caches — both of them must
 * keep 404ing on null, so the helper cannot absorb the difference for them.
 *
 * `/contact` is the third consumer and has the opposite contract: null already
 * means "no WordPress page, use the built-in copy", and a store with no Contact
 * page still gets a working contact form. An outage is not a better reason to
 * take that away, and this route is PRERENDERED (`instant = true`), so an
 * uncaught throw would fail `next build` for every store on the template rather
 * than ship slightly degraded copy. Next control flow is re-raised first and is
 * never absorbed.
 *
 * AT BUILD the degraded copy IS the artifact, so the tolerance is not free. A
 * blip while prerendering this route makes the read throw, the fallback copy
 * renders, the page SUCCEEDS, and that store's `/contact` permanently ships
 * HeadKit's generic placeholder in place of the merchant's real WordPress page.
 * The throwing read stores no cache entry, so nothing guarantees a re-render:
 * recovery is a redeploy, or `revalidateTag(TAG.page(CONTACT_SLUG))`
 * (`lib/cache-tags.ts`). That is why this catch LOGS — the same rule the PDP
 * degrade in `app/products/[...slug]/page.tsx` follows, and the same reason:
 * never bake a lie, and never be silent about degrading. A build that shipped a
 * placeholder Contact page must be distinguishable from a clean one by its
 * output alone, and the line carries the slug so the recovery lever can be
 * aimed.
 */
async function loadContactPage(): Promise<Awaited<
  ReturnType<typeof getPageData>
> | null> {
  try {
    return await getPageData(CONTACT_SLUG);
  } catch (error) {
    unstable_rethrow(error);
    logger.error("contact.degraded_render", {
      pageSlug: CONTACT_SLUG,
      recovery: `revalidateTag(${TAG.page(CONTACT_SLUG)})`,
      ...errorFields(error),
    });
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const [page, { seoSettings, storeSettings }] = await Promise.all([
    loadContactPage(),
    getBranding(),
  ]);
  if (!page) {
    return {
      title: "Contact Us",
      description: "Get in touch with our team.",
    };
  }
  return await makeSeoMetadata(page.seo ?? null, {
    title: page.title,
    description: seoFallbackDescription("page", page.title),
    canonical: storefrontUrl(`/${CONTACT_SLUG}`, storeSettings.domain),
    siteUrl: storeSettings.domain,
    allowIndexing: seoSettings.allowIndexing,
  });
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function ContactPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] space-y-4 px-5 py-10 md:px-10">
          <Skeleton animated={false} className="h-4 w-40" />
          <Skeleton animated={false} className="h-10 w-48" />
          <Skeleton animated={false} className="h-4 w-full max-w-xl" />
        </div>
      }
    >
      <ContactRoute />
    </Suspense>
  );
}

async function ContactRoute(): Promise<React.ReactElement> {
  const page = await loadContactPage();

  // Prefer the WordPress Contact page for copy, but never let a page without a
  // form produce a contact page without a contact form.
  //
  // This read used to be `page?.content ?? <default with marker>`, so the
  // default applied only when the page was ABSENT. A store migrating from the
  // old storefront has a Contact page full of real copy and no `[gravityform]`
  // shortcode — because there the form was placed by CODE
  // (`<GravityForm formId="1" />` in its /contact route), and moving placement
  // into page content gave nobody a reason to add one. Such a page rendered its
  // copy and no form, answering 200, which is why no status sweep saw it.
  //
  // `withGuaranteedFormMarker` returns the page untouched when it already
  // places a form, so an editor who chose a different form — or several — still
  // wins.
  const title = page?.title ?? "Contact Us";
  const copy =
    page?.content ??
    "<p>Have a question? Fill in the form and our team will get back to you shortly.</p>";
  const html = withGuaranteedFormMarker(copy, CONTACT_FORM_ID);

  // Padding lives in CmsPageBody (same as other CMS pages) so a Contact page
  // with a hero carousel stays flush with the homepage layout.
  return (
    <div className="headkit-contact min-h-[50vh] overflow-hidden">
      <BreadcrumbJsonLD
        items={[
          { name: "Home", href: "/" },
          { name: title, href: "/contact" },
        ]}
      />
      <CmsPageBody
        title={title}
        html={html}
        editorBlocks={
          (page?.editorBlocks ?? []) as Array<{
            products?: unknown[];
            attrs?: Record<string, unknown> | null;
            queryType?: string | null;
          }>
        }
        formFallback={<ContactFormFallback />}
      />
    </div>
  );
}
