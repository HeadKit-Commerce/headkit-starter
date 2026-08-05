import type { Metadata } from "next";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CmsPageBody } from "@/components/headkit-ui/cms-page-body";
import { getPageData } from "@/app/[...slug]/page";

/**
 * Contact is a WordPress page (slug `contact`), not a hardcoded storefront
 * route. Editors place a Gravity Forms shortcode/block in the page; the theme
 * emits a `.headkit-gravity-form` marker and CmsPageBody renders the standard
 * 2-column form layout.
 *
 * Seed: docker/wordpress/seed-starter-content.php embeds `[gravityform id="1"]`
 * when GF form 1 (Contact) exists. Product enquiry on the PDP still uses form
 * id 3 — see ENQUIRY_FORM_ID in product-detail.tsx.
 */
const CONTACT_SLUG = "contact";

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

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageData(CONTACT_SLUG);
  if (!page) {
    return {
      title: "Contact Us",
      description: "Get in touch with our team.",
    };
  }
  return makeSeoMetadata(page.seo ?? null, {
    title: page.title,
    description: seoFallbackDescription("page", page.title),
  });
}

export default async function ContactPage(): Promise<React.ReactElement> {
  const page = await getPageData(CONTACT_SLUG);

  // Prefer the WordPress Contact page. When it is missing (fresh local without
  // seed), fall back to a minimal marker so form id 1 still renders — editors
  // should create/publish the Contact page in WP for real copy.
  const title = page?.title ?? "Contact Us";
  const html =
    page?.content ??
    [
      "<p>Have a question? Fill in the form and our team will get back to you shortly.</p>",
      '<div class="headkit-gravity-form" data-form-id="1" data-headkit-gf="1"></div>',
    ].join("");

  return (
    <div className="min-h-[50vh] px-5 py-10 md:px-10 md:py-16">
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
