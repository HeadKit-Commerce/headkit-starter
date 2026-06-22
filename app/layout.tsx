import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { NavigationWrapper } from "@/components/headkit-ui/navigation-wrapper";
import { CartProvider } from "@/components/headkit-ui/cart-context";
import { CartDrawer } from "@/components/headkit-ui/cart-drawer";
import { AuthProvider } from "@/components/headkit-ui/auth-context";
import { Footer } from "@/components/headkit-ui/footer";
import { WebsiteJsonLD } from "@/components/seo/website-json-ld";
import { OrganizationJsonLD } from "@/components/seo/organization-json-ld";
import { makeRootMetadata } from "@/lib/make-metadata";
import { GoogleTagManager } from "@next/third-parties/google";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

export async function generateMetadata(): Promise<Metadata> {
  try {
    return makeRootMetadata({
      title: "HeadKit",
      description: "HeadKit",
    });
  } catch {
    return makeRootMetadata({ title: "HeadKit Starter" });
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="HeadKit" />
      </head>
      <body
        className={`${urbanist.className} ${urbanist.variable} antialiased`}
      >
        {/* GTM noscript fallback */}
        {GTM_ID && <GoogleTagManager gtmId={GTM_ID} />}

        <WebsiteJsonLD siteName="HeadKit" siteUrl={SITE_URL} />
        {/* Global Organization JSON-LD (D-04 core type) — rendered once at the
            site-wide altitude so every entity page inherits it without
            per-route duplication. */}
        <OrganizationJsonLD name="HeadKit" url={SITE_URL} />

        <AuthProvider>
          <CartProvider>
            <CartDrawer />
            <Suspense fallback={<div className="h-20 bg-white/80" />}>
              <NavigationWrapper />
            </Suspense>
            {children}
            <Footer
              siteName="HeadKit"
              description="HeadKit is the cloud platform making it easy to build headless commerce stores."
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
