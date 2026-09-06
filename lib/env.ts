import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_HEADKIT_PUBLIC_KEY: z.string().min(1),
  NEXT_PUBLIC_FRONTEND_URL: z.string().url().optional(),
  NEXT_PUBLIC_GTM_ID: z.string().optional(),
  // Canonical Hive gateway URL (FE-11). REQUIRED — a missing/invalid gateway
  // URL fails loudly at boot rather than silently falling back at request time.
  NEXT_PUBLIC_GRAPHQL_URL: z.string().url(),
  NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_HUBSPOT_PORTAL_ID: z.string().optional(),
  // Store display currency (ISO 4217) for catalog surfaces with no cart/order
  // context — see getStoreCurrency() in lib/utils.ts. Defaults to AUD there.
  NEXT_PUBLIC_STORE_CURRENCY: z.string().length(3).optional(),
  // Gravity Forms form id mounted on /wholesale. Per-STORE, so it is
  // configuration rather than a literal in the shared route, and a per-store
  // difference must not fork the page.
  //
  // Unset = the Woo route renders content only, with NO FORM. `/wholesale`
  // answers 200 either way, so a Woo store that should have a wholesale form
  // and lacks this value looks healthy from outside. Nothing in provisioning
  // sets it — check it when standing up a store whose predecessor had a
  // wholesale form. Shopify storefronts ignore this and render the built-in
  // Online Store contact form instead (see ShopifyContactForm).
  //
  // This comment previously read "Dishee mounts its enquiry form on /contact
  // instead" as the justification for leaving it unset. That was wrong, and it
  // is why Dishee's V2 store had no wholesale form: the live V1 site serves
  // BOTH — a 3-field form on /contact and a separate 8-field form on
  // /wholesale. Do not cite a store as an example here without opening it.
  NEXT_PUBLIC_WHOLESALE_FORM_ID: z.string().optional(),
  // Shopify Customer Account API (Phase F). When "true", /account shows
  // "Continue with Shopify"; OAuth uses the fixed platform callback on
  // dashboard-api (not a per-storefront redirect_uri).
  NEXT_PUBLIC_SHOPIFY_CAA_ENABLED: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_SHOPIFY_SHOP_ID: z.string().optional(),
  NEXT_PUBLIC_SHOPIFY_CAA_CLIENT_ID: z.string().optional(),
  // Sales-channel handle appended to Shopify cart.checkoutUrl so Online Store
  // password protection does not intercept Checkout. Defaults to
  // headless-storefronts in lib/hosted-checkout.ts when unset.
  NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL: z.string().min(1).optional(),
  // Optional custom Shopify checkout hostname (no protocol). When set,
  // hostedCheckoutUrl rewrites cart.checkoutUrl to this host (Dashboard →
  // Checkout → custom checkout subdomain).
  NEXT_PUBLIC_SHOPIFY_CHECKOUT_DOMAIN: z.string().min(1).optional(),
});

const serverSchema = clientSchema.extend({
  HEADKIT_PRIVATE_KEY: z.string().min(1),
  // Set by `next build` on itself and inherited by its prerender workers
  // (`phase-production-build`); absent at runtime. The ONLY discriminator
  // `lib/bulk-product-prefetch.ts` uses to stay inert outside a build.
  NEXT_PHASE: z.string().optional(),
  // "0" skips the build-time bulk product prefetch entirely — not even the
  // status query. Unset/"1" = consult commerce's per-store gate.
  HEADKIT_BULK_PREFETCH: z.enum(["0", "1"]).optional(),
  // Bulk pages one prefetch keeps in flight (default 3). Each page is ~5 s of
  // origin PHP, so 3 is ~0.6 req/s against a 2 req/s origin.
  HEADKIT_BULK_PREFETCH_CONCURRENCY: z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
  REVALIDATION_SECRET: z.string().optional(),
  DASHBOARD_API_URL: z.string().url().optional(),
  DASHBOARD_API_TOKEN: z.string().min(1).optional(),
  // Platform dashboard-api origin for CAA start/redeem (optional; also
  // derived by stripping /graphql/subgraph/headkit from DASHBOARD_API_URL).
  HEADKIT_PLATFORM_URL: z.string().url().optional(),
  SHOPIFY_CAA_CLIENT_ID: z.string().optional(),
  SHOPIFY_STORE_DOMAIN: z.string().optional(),
  SHOPIFY_SHOP_ID: z.string().optional(),
});

type ClientEnv = z.infer<typeof clientSchema>;
type ServerEnv = z.infer<typeof serverSchema>;

function createEnv(): ClientEnv & Partial<ServerEnv> {
  const isServer = typeof window === "undefined";

  if (isServer) {
    return serverSchema.parse(process.env);
  }

  return clientSchema.parse({
    NEXT_PUBLIC_HEADKIT_PUBLIC_KEY: process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY,
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || undefined,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID || undefined,
    NEXT_PUBLIC_GRAPHQL_URL: process.env.NEXT_PUBLIC_GRAPHQL_URL,
    NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY:
      process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY || undefined,
    NEXT_PUBLIC_HUBSPOT_PORTAL_ID:
      process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || undefined,
    NEXT_PUBLIC_STORE_CURRENCY:
      process.env.NEXT_PUBLIC_STORE_CURRENCY || undefined,
    NEXT_PUBLIC_WHOLESALE_FORM_ID:
      process.env.NEXT_PUBLIC_WHOLESALE_FORM_ID || undefined,
    NEXT_PUBLIC_SHOPIFY_CAA_ENABLED:
      process.env.NEXT_PUBLIC_SHOPIFY_CAA_ENABLED === "true" ||
      process.env.NEXT_PUBLIC_SHOPIFY_CAA_ENABLED === "false"
        ? process.env.NEXT_PUBLIC_SHOPIFY_CAA_ENABLED
        : undefined,
    NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN:
      process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || undefined,
    NEXT_PUBLIC_SHOPIFY_SHOP_ID:
      process.env.NEXT_PUBLIC_SHOPIFY_SHOP_ID || undefined,
    NEXT_PUBLIC_SHOPIFY_CAA_CLIENT_ID:
      process.env.NEXT_PUBLIC_SHOPIFY_CAA_CLIENT_ID || undefined,
    NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL:
      process.env.NEXT_PUBLIC_SHOPIFY_CHECKOUT_CHANNEL || undefined,
  });
}

export const env = createEnv();
