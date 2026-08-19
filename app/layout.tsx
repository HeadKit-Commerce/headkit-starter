import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
// Customer-owned UI/styling layer — prefer overrides/ over editing core components.
import "@/overrides/styles.css";
import {
  NavigationWrapper,
  getFooterMenus,
} from "@/components/headkit-ui/navigation-wrapper";
import { CartProvider } from "@/components/headkit-ui/cart-context";
import { AuthProvider } from "@/components/headkit-ui/auth-context";
import { Footer } from "@/components/headkit-ui/footer";
import { LazyCartDrawer } from "@/components/headkit-ui/lazy-cart-drawer";
import { WebsiteJsonLD } from "@/components/seo/website-json-ld";
import { OrganizationJsonLD } from "@/components/seo/organization-json-ld";
import {
  makeRootMetadata,
  brandingIcons,
  resolveFooterDescription,
  resolveStoreName,
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { normalizeCheckoutMode } from "@/lib/checkout-mode";
import { CheckoutModeProvider } from "@/components/checkout/checkout-mode-provider";
import { CatalogDisplayProvider } from "@/components/headkit-ui/catalog-display-provider";
import { resolveBrandFonts } from "@/lib/brand-fonts";
import { resolveOnPrimaryTextColor } from "@/lib/contrast";
import { BrandingIconsProvider } from "@/components/branding/branding-icons-provider";
import { DeferredThirdPartyScripts } from "@/components/headkit-ui/deferred-third-party-scripts";
import { getEmailMarketingStatus } from "@/lib/email-marketing";
import { Toaster } from "@/components/ui/toaster";

// Build-time env GTM id (kept as a fallback); per-tenant gtmId from
// dashboard-api StoreSettings takes precedence at runtime (FE-08).
const ENV_GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
// Env public key fallbacks; store emailConnection.publicApiKey wins.
const ENV_KLAVIYO_PUBLIC_KEY = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
const ENV_HUBSPOT_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
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

const CORNER_STYLE_VARS: Record<string, string> = {
  soft: "--radius: 0.5rem; --radius-button: 0.375rem;",
  round: "--radius: 1.25rem; --radius-button: 9999px;",
  square: "--radius: 0; --radius-button: 0;",
};

export async function generateMetadata(): Promise<Metadata> {
  // SeoSettings from dashboard-api feeds the root metadata fallback (FE-08).
  // Local degrade → null SEO fields; floor is store name (never HeadKit marketing).
  try {
    const [{ seoSettings, storeSettings }, { iconUrl }] = await Promise.all([
      getBranding(),
      getBrandingAssets(),
    ]);
    const siteName = resolveStoreName(storeSettings.name);
    return {
      ...makeRootMetadata({
        title: seoSettings.title?.trim() || siteName,
        description: seoSettings.description?.trim() || "",
        siteName,
        iconUrl,
        ogImageUrl: seoSettings.ogImageUrl,
        allowIndexing: seoSettings.allowIndexing,
      }),
      // Site-wide favicon (branding icon, or the bundled default). Owned by the
      // layout so page metadata never overrides the per-store tab icon (ENG-572).
      icons: brandingIcons(iconUrl),
    };
  } catch {
    return {
      ...makeRootMetadata({ siteName: "Store" }),
      icons: brandingIcons(null),
    };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-tenant branding + CMS footer menus (Footer / Footer 2 / Footer Policy).
  // Both degrade gracefully (branding → defaults; empty menus → static footer).
  const [
    { branding, storeSettings, seoSettings },
    footerMenus,
    { iconUrl },
    emailMarketing,
  ] = await Promise.all([
    getBranding(),
    getFooterMenus(),
    getBrandingAssets(),
    getEmailMarketingStatus(),
  ]);

  const siteName = resolveStoreName(storeSettings.name);
  const gtmId = storeSettings.gtmId ?? ENV_GTM_ID;
  const checkoutMode = normalizeCheckoutMode(storeSettings.checkoutType);
  const emailProvider = emailMarketing.provider.toLowerCase();
  const klaviyoPublicKey =
    emailProvider === "klaviyo"
      ? emailMarketing.publicApiKey || ENV_KLAVIYO_PUBLIC_KEY || null
      : emailProvider === ""
        ? ENV_KLAVIYO_PUBLIC_KEY || null
        : null;
  const hubspotPortalId =
    emailProvider === "hubspot"
      ? emailMarketing.publicApiKey || ENV_HUBSPOT_PORTAL_ID || null
      : emailProvider === "" && !klaviyoPublicKey
        ? ENV_HUBSPOT_PORTAL_ID || null
        : null;
  const showFooterSubscribe = emailMarketing.enabled;
  // Feeds two consumers: the Footer paragraph and the WebSite JSON-LD
  // `description`. When the dashboard SEO description is unset both render
  // nothing by design — never the store name, which is not a description.
  const siteDescription = resolveFooterDescription(seoSettings.description);
  const orgLogoUrl = iconUrl ?? branding.iconUrl ?? undefined;

  const fonts = await resolveBrandFonts({
    heading: branding.headingFont,
    subheading: branding.subheadingFont,
    body: branding.bodyFont,
  });

  // Inject per-tenant brand tokens as :root CSS custom properties.
  const primary = safeColor(branding.primaryColor);
  const secondary = safeColor(branding.secondaryColor);
  const background = safeColor(branding.backgroundColor);
  const text = safeColor(branding.textColor);
  const cornerVars =
    CORNER_STYLE_VARS[branding.cornerStyle] ?? CORNER_STYLE_VARS.soft;

  // CTA / on-primary text: the brand background is KEPT whenever it already
  // clears 4.5:1 against the primary, and only otherwise falls back to black or
  // white. This replaces an unconditional alias to the background, which was
  // correct only while the primary was dark — a light primary over a light
  // background (mint on white ≈ 1.7:1) made every filled control unreadable,
  // and no branding value a merchant can enter could fix it.
  const onPrimaryText = background
    ? resolveOnPrimaryTextColor(primary, background)
    : null;
  const brandVars = [
    primary
      ? `--color-primary: ${primary}; --color-purple-500: ${primary}; --color-purple-800: ${primary};`
      : "",
    secondary ? `--color-secondary: ${secondary};` : "",
    background
      ? `--color-background: ${background}; --background: ${background}; --color-primary-text: ${onPrimaryText ?? background};`
      : "",
    text
      ? `--color-text: ${text}; --foreground: ${text}; --color-purple-900: ${text};`
      : "",
    cornerVars,
    fonts.cssVars,
    "--font-sans: var(--font-body);",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={fonts.variableClassNames}
    >
      <head>
        <meta name="apple-mobile-web-app-title" content={siteName} />
        {/*
          Brand fonts: selected curated faces as inline @font-face (Fontsource
          latin woff2) + upload @font-face via same-origin proxy. No
          fonts.googleapis.com and no unused next/font CSS chunks.
        */}
        {fonts.usesFontsourceCdn ? (
          <link
            rel="preconnect"
            href="https://cdn.jsdelivr.net"
            crossOrigin="anonymous"
          />
        ) : null}
        {/* Per-tenant brand token overrides. Empty pieces leave globals.css defaults. */}
        {(brandVars || fonts.fontFaceCss) && (
          <style
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `${fonts.fontFaceCss}${brandVars ? `:root { ${brandVars} }` : ""}`,
            }}
          />
        )}
      </head>
      {/*
        Fonts apply via :root CSS vars (--font-body) + Tailwind font-sans —
        not next/font body classNames (those fought the layered body rule).
      */}
      <body className="antialiased font-sans">
        {/* Marketing tags (GTM / Klaviyo / HubSpot) — idle + gesture deferred so
            they stay off the LCP / TBT critical path (mobile CWV). */}
        <DeferredThirdPartyScripts
          gtmId={gtmId}
          klaviyoPublicKey={klaviyoPublicKey}
          hubspotPortalId={hubspotPortalId}
        />

        <WebsiteJsonLD
          siteName={siteName}
          siteUrl={SITE_URL}
          description={siteDescription}
        />
        <OrganizationJsonLD
          name={siteName}
          url={SITE_URL}
          {...(orgLogoUrl ? { logoUrl: orgLogoUrl } : {})}
        />

        <Suspense fallback={null}>
          <BrandingIconsProvider library={branding.iconLibrary}>
            <CatalogDisplayProvider
              prefs={{
                showVariants: branding.showVariants,
                showSwatches: branding.showSwatches,
                imageRollover: branding.imageRollover,
                defaultCollectionSort: branding.defaultCollectionSort,
              }}
            >
              <CheckoutModeProvider mode={checkoutMode}>
                <AuthProvider>
                  <CartProvider>
                    <LazyCartDrawer />
                    <NavigationWrapper />
                    <main className="headkit-main pb-10">{children}</main>
                    <Footer
                      siteName={siteName}
                      description={siteDescription}
                      menus={footerMenus}
                      iconUrl={branding.iconUrl}
                      showSubscribe={showFooterSubscribe}
                      hidePaymentIcons={checkoutMode === "quote"}
                      socialLinks={{
                        instagram: "https://www.instagram.com/headkitcommerce",
                        discord: "https://discord.gg/bSNe29JtsX",
                        github: "https://github.com/headkit-commerce",
                        linkedin:
                          "https://www.linkedin.com/company/headkit-commerce/",
                        youtube: "https://www.youtube.com/@headkit-commerce",
                      }}
                    />
                    <Toaster />
                  </CartProvider>
                </AuthProvider>
              </CheckoutModeProvider>
            </CatalogDisplayProvider>
          </BrandingIconsProvider>
        </Suspense>
      </body>
    </html>
  );
}
