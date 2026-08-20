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
  // Unset = the route renders content only, with NO FORM, and nothing reports
  // that. `/wholesale` answers 200 either way, so a store that should have a
  // wholesale form and lacks this value looks healthy from outside. Nothing in
  // provisioning sets it, so it is set by hand or not at all — check it when
  // standing up a store whose predecessor had a wholesale form.
  //
  // This comment previously read "Dishee mounts its enquiry form on /contact
  // instead" as the justification for leaving it unset. That was wrong, and it
  // is why Dishee's V2 store had no wholesale form: the live V1 site serves
  // BOTH — a 3-field form on /contact and a separate 8-field form on
  // /wholesale. Do not cite a store as an example here without opening it.
  NEXT_PUBLIC_WHOLESALE_FORM_ID: z.string().optional(),
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
  REVALIDATION_SECRET: z.string().optional(),
  // Stripe Apple Pay domain-association token, served at
  // /.well-known/apple-developer-merchantid-domain-association (see that route).
  // Downloaded from the Stripe Dashboard per deploy domain; optional so local /
  // unregistered deploys boot fine (Apple Pay just stays hidden).
  APPLE_PAY_DOMAIN_ASSOCIATION: z.string().optional(),
  DASHBOARD_API_URL: z.string().url().optional(),
  DASHBOARD_API_TOKEN: z.string().min(1).optional(),
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
  });
}

export const env = createEnv();
