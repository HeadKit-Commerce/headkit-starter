import { getBranding } from "@/lib/branding";
import { getEmailMarketingStatus } from "@/lib/email-marketing";
import { shopifyUpdatesSubscribeLabel } from "@/lib/shopify-contact";

export type ShopifyContactSubscribeProps = {
  subscribeEnabled: boolean;
  subscribeLabel: string;
};

/**
 * Klaviyo checkbox props for Shopify shopper forms.
 * Hidden when the store has no email-marketing connection.
 */
export async function shopifyContactSubscribeProps(): Promise<ShopifyContactSubscribeProps> {
  const [marketing, branding] = await Promise.all([
    getEmailMarketingStatus(),
    getBranding(),
  ]);
  return {
    subscribeEnabled: marketing.enabled,
    subscribeLabel: shopifyUpdatesSubscribeLabel(branding.storeSettings.name),
  };
}
