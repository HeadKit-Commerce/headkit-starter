import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { cacheLife, cacheTag } from "next/cache";
import { NavigationWrapper } from "@/components/headkit-ui/navigation-wrapper";
import { CartProvider } from "@/components/headkit-ui/cart-context";
import { CartDrawer } from "@/components/headkit-ui/cart-drawer";
import { AuthProvider } from "@/components/headkit-ui/auth-context";
import { Footer } from "@/components/headkit-ui/footer";
import { WebsiteJsonLD } from "@/components/seo/website-json-ld";
import { makeRootMetadata } from "@/lib/make-metadata";
import { GoogleTagManager } from "@next/third-parties/google";
import { ThemeCSS } from "@/components/theme-css";
import {
  executeRequest,
  HEADKIT_GRAPHQL_URL,
  GetBrandingDocument,
} from "@headkit/sdk";
import { env } from "@/lib/env";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});


async function getBranding() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:branding");
  try {
    const apiKey = env.HEADKIT_PRIVATE_KEY;
    if (!apiKey) return null;
    const url = env.NEXT_PUBLIC_GRAPHQL_URL ?? HEADKIT_GRAPHQL_URL;
    const data = await executeRequest({ url, apiKey }, GetBrandingDocument, undefined);
    return data.commerce.branding;
  } catch {
    return null;
  }
}

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
  const branding = await getBranding();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="HeadKit" />
        <ThemeCSS branding={branding} />
      </head>
      <body
        className={`${urbanist.className} ${urbanist.variable} antialiased`}
      >
        {/* GTM noscript fallback */}
        {env.NEXT_PUBLIC_GTM_ID && <GoogleTagManager gtmId={env.NEXT_PUBLIC_GTM_ID} />}

        <WebsiteJsonLD siteName="HeadKit" siteUrl={env.NEXT_PUBLIC_FRONTEND_URL ?? ""} />

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
