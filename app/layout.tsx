import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";
import {
  NavigationWrapper,
  getFooterMenu,
} from "@/components/headkit-ui/navigation-wrapper";
import { CartProvider } from "@/components/headkit-ui/cart-context";
import { CartDrawer } from "@/components/headkit-ui/cart-drawer";
import { AuthProvider } from "@/components/headkit-ui/auth-context";
import { Footer } from "@/components/headkit-ui/footer";
import { WebsiteJsonLD } from "@/components/seo/website-json-ld";
import { OrganizationJsonLD } from "@/components/seo/organization-json-ld";
import { makeRootMetadata, brandingIcons } from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { GoogleTagManager } from "@next/third-parties/google";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

// Build-time env GTM id (kept as a fallback); per-tenant gtmId from
// dashboard-api StoreSettings takes precedence at runtime (FE-08).
const ENV_GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

const HEX_OR_RGB =
  /^(#(?:[0-9a-fA-F]{3,8})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/;

/**
 * Sanitize a branding color value before injecting it into a CSS custom
 * property (T-03-B2). Only well-formed hex / rgb / rgba values pass; anything
 * else (including attempts to break out of the declaration) is dropped so the
 * built-in `globals.css` default applies instead.
 */
function safeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return HEX_OR_RGB.test(v) ? v : null;
}

export async function generateMetadata(): Promise<Metadata> {
  // SeoSettings from dashboard-api feeds the root metadata fallback (FE-08).
  // Under the local "degrade" path getBranding() returns null SEO fields, so
  // this preserves the existing "HeadKit" defaults (and 03-06's behavior).
  try {
    // getBranding() feeds SEO/title; getBrandingAssets() resolves the per-store
    // favicon/OG icon (ENG-572) — commerce iconUrl (available locally) with a
    // dashboard-api fallback. Null iconUrl → makeRootMetadata omits icons, so
    // the file-convention default favicon still applies.
    const [{ seoSettings, storeSettings }, { iconUrl }] = await Promise.all([
      getBranding(),
      getBrandingAssets(),
    ]);
    return {
      ...makeRootMetadata({
        title: seoSettings.title ?? "HeadKit",
        description: seoSettings.description ?? "HeadKit",
        siteName: storeSettings.name ?? "HeadKit",
        iconUrl,
      }),
      // Site-wide favicon (branding icon, or the bundled default). Owned by the
      // layout so page metadata never overrides the per-store tab icon (ENG-572).
      icons: brandingIcons(iconUrl),
    };
  } catch {
    return {
      ...makeRootMetadata({ title: "HeadKit Starter" }),
      icons: brandingIcons(null),
    };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-tenant branding + the CMS FOOTER menu, fetched server-side. Both
  // degrade gracefully (branding → documented defaults if dashboard-api is
  // unavailable locally; footer → empty list → branding/static footer).
  const [{ branding, storeSettings }, footerItems] = await Promise.all([
    getBranding(),
    getFooterMenu(),
  ]);

  const siteName = storeSettings.name ?? "HeadKit";
  const gtmId = storeSettings.gtmId ?? ENV_GTM_ID;

  // Inject per-tenant brand colors as :root CSS custom properties, overriding
  // the globals.css defaults at runtime (FE-08). Sanitized to color literals
  // only (T-03-B2). When a value is missing/invalid we omit the override so
  // the globals.css default (#7f54b3 / #000000) applies (no hardcoded brand hex).
  // Also set --color-purple-500 so Tailwind hover/accent utilities
  // (hover:stroke-purple-500, hover:outline-purple-500, bg-purple-500, …)
  // track the brand primary — purple-500 defaults to var(--color-primary)
  // in globals.css, but an explicit twin keeps ThemeCSS / forks in sync.
  const primary = safeColor(branding.primaryColor);
  const secondary = safeColor(branding.secondaryColor);
  const brandVars = [
    primary
      ? `--color-primary: ${primary}; --color-purple-500: ${primary};`
      : "",
    secondary ? `--color-secondary: ${secondary};` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Map the flat CMS FOOTER menu into the Footer's column sections: each
  // top-level item becomes a column (its children are the links).
  const footerMenus = footerItems.map((item) => ({
    location: item.id,
    name: item.label,
    items: (item.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
      uri: child.uri,
    })),
  }));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content={siteName} />
        {/* Per-tenant brand color overrides (FE-08). Empty when branding
            degrades to defaults, leaving globals.css :root values in effect. */}
        {brandVars && (
          <style
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: `:root { ${brandVars} }` }}
          />
        )}
      </head>
      <body
        className={`${urbanist.className} ${urbanist.variable} antialiased`}
      >
        {/* GTM — per-tenant StoreSettings.gtmId, falling back to env (FE-08) */}
        {gtmId && <GoogleTagManager gtmId={gtmId} />}

        <WebsiteJsonLD siteName={siteName} siteUrl={SITE_URL} />
        {/* Global Organization JSON-LD (D-04 core type) — rendered once at the
            site-wide altitude so every entity page inherits it without
            per-route duplication. */}
        <OrganizationJsonLD name={siteName} url={SITE_URL} />

        {/* Providers are pure client state with no request reads at render:
            AuthProvider no longer calls usePathname(), CartProvider/CartDrawer
            hold client-only cart state. Rendering them (and the cached nav,
            page children, and footer) OUTSIDE any Suspense boundary keeps this
            whole subtree in the prerendered static shell, in document order —
            visible without JavaScript. A root-altitude boundary here would
            exclude the entire body from every route's shell. Routes with
            genuinely dynamic reads (cookies, un-enumerated params) own their
            own per-segment loading.tsx / <Suspense> islands instead. */}
        <AuthProvider>
          <CartProvider>
            <CartDrawer />
            <NavigationWrapper />
            {/* Single <main> landmark for all routes (a11y: landmark-one-main
                failed on every measured route without it). */}
            <main>{children}</main>
            <Footer
              siteName={siteName}
              description="HeadKit is the cloud platform making it easy to build headless commerce stores."
              menus={footerMenus}
              iconUrl={branding.iconUrl}
              socialLinks={{
                instagram: "https://www.instagram.com/headkitcommerce",
                discord: "https://discord.gg/bSNe29JtsX",
                github: "https://github.com/headkit-commerce",
                linkedin: "https://www.linkedin.com/company/headkit-commerce/",
                youtube: "https://www.youtube.com/@headkit-commerce",
              }}
            />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
