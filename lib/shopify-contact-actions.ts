"use server";

import { env } from "@/lib/env";
import { subscribeEmailAction } from "@/lib/email-marketing-actions";
import {
  postShopifyContact,
  type ShopifyContactInput,
} from "@/lib/shopify-contact";

export type SubmitShopifyContactResult =
  | { ok: true }
  | { ok: false; error: string };

export type SubmitShopifyContactInput = ShopifyContactInput & {
  subscribe?: boolean;
};

function shopifyStoreDomain(): string | undefined {
  const domain =
    env.SHOPIFY_STORE_DOMAIN ?? env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const trimmed = domain?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * POST the shopper's message to Shopify's built-in `/contact` route.
 * Origin/Referer are the shop host so the Online Store accepts the request.
 */
export async function submitShopifyContact(
  input: SubmitShopifyContactInput,
): Promise<SubmitShopifyContactResult> {
  const domain = shopifyStoreDomain();
  if (!domain) {
    return { ok: false, error: "Shopify store domain is not configured." };
  }
  const email = input.email.trim();
  const name = input.name.trim();
  const body = input.body.trim();
  if (!email || !name || !body) {
    return { ok: false, error: "Name, email, and message are required." };
  }
  try {
    await postShopifyContact(domain, {
      name,
      email,
      phone: input.phone,
      body,
      context: input.context,
      extras: input.extras,
    });
  } catch {
    return {
      ok: false,
      error: "We couldn't send your message. Please try again shortly.",
    };
  }

  if (input.subscribe === true) {
    try {
      await subscribeEmailAction({
        email,
        source: "form",
      });
    } catch {
      // The Shopify enquiry already landed; do not fail the form on list signup.
    }
  }

  return { ok: true };
}
