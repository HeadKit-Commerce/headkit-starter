import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import {
  NavigationWrapper,
  getFooterMenus,
} from "@/components/headkit-ui/navigation-wrapper";
import { CartProvider } from "@/components/headkit-ui/cart-context";
import { CartDrawer } from "@/components/headkit-ui/cart-drawer";
import { AuthProvider } from "@/components/headkit-ui/auth-context";
import { Footer } from "@/components/headkit-ui/footer";
import { WebsiteJsonLD } from "@/components/seo/website-json-ld";
import { OrganizationJsonLD } from "@/components/seo/organization-json-ld";
import {
  makeRootMetadata,
  brandingIcons,
  resolveFooterDescription,
  resolveStoreName,
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { resolveBrandFonts } from "@/lib/brand-fonts";
import { BrandingIconsProvider } from "@/components/branding/branding-icons-provider";
import { GoogleTagManager } from "@next/third-parties/google";
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
  // Footer blurb: dashboard SEO description → else store name only.
  const siteDescription = resolveFooterDescription(
    seoSettings.description,
    storeSettings.name,
  );
  const orgLogoUrl = iconUrl ?? branding.iconUrl ?? undefined;

  const fonts = resolveBrandFonts({
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

  // CTA / on-primary text uses the brand background so primary-filled buttons
  // and hero titles stay legible against the tenant primary colour.
  const brandVars = [
    primary
      ? `--color-primary: ${primary}; --color-purple-500: ${primary}; --color-purple-800: ${primary};`
      : "",
    secondary ? `--color-secondary: ${secondary};` : "",
    background
      ? `--color-background: ${background}; --background: ${background}; --color-primary-text: ${background};`
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
          Brand fonts ship only via next/font (self-hosted) + upload @font-face.
          No remote Google Fonts CSS — unknown dashboard families → Urbanist.
        */}
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
        Do not apply next/font `bodyClassName` here — that class sets
        `font-family` outside @layer and beats `body { font-family: var(--font-body) }`.
        Variable classes on <html> + --font-body CSS vars are enough.
      */}
      <body className="antialiased font-sans">
        {/* GTM — per-tenant StoreSettings.gtmId, falling back to env (FE-08) */}
        {gtmId && <GoogleTagManager gtmId={gtmId} />}

        {/* Email marketing onsite scripts — Klaviyo (__kla_id) or HubSpot tracking */}
        {/* ENG-856: defer marketing pixels until after load so they don't contend
            with hydration / INP. GTM stays afterInteractive for tag timing. */}
        {klaviyoPublicKey ? (
          <Script
            src={`https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${encodeURIComponent(klaviyoPublicKey)}`}
            strategy="lazyOnload"
          />
        ) : null}
        {hubspotPortalId ? (
          <Script
            id="hs-script-loader"
            src={`//js.hs-scripts.com/${encodeURIComponent(hubspotPortalId)}.js`}
            strategy="lazyOnload"
          />
        ) : null}

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

        <BrandingIconsProvider library={branding.iconLibrary}>
          <AuthProvider>
            <CartProvider>
              <CartDrawer />
              <NavigationWrapper />
              <main>{children}</main>
              <Footer
                siteName={siteName}
                description={siteDescription}
                menus={footerMenus}
                iconUrl={branding.iconUrl}
                showSubscribe={showFooterSubscribe}
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
        </BrandingIconsProvider>
      </body>
    </html>
  );
}
