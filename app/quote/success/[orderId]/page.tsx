import type { Metadata, ResolvingMetadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getOrderAction } from "@/app/checkout/actions";
import { ClearCart } from "@/components/checkout/clear-cart";
import { QuoteConfirmation } from "@/components/quote/quote-confirmation";
import { getBranding } from "@/lib/branding";
import { normalizeCheckoutMode } from "@/lib/checkout-mode";
import {
  QUOTE_DETAILS_COOKIE,
  parseQuoteDetailsCookie,
  type QuoteFormDetails,
} from "@/lib/quote-form";
import { stripTitleMarkers } from "@/lib/title-emphasis";

interface Props {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ key?: string }>;
}

export async function generateMetadata(
  _props: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = await parent;
  return { title: p.title, description: p.description };
}

function detailsFromOrder(
  order: NonNullable<Awaited<ReturnType<typeof getOrderAction>>>,
): QuoteFormDetails {
  const billing = order.billingAddress;
  return {
    email: billing.email ?? "",
    firstName: billing.firstName ?? "",
    lastName: billing.lastName ?? "",
    phone: billing.phone ?? "",
    company: billing.company ?? "",
    industry: billing.address2 ?? "",
    state: billing.state ?? "",
    comments: "",
  };
}

export default async function QuoteSuccessPage({
  params,
  searchParams,
}: Props): Promise<React.ReactElement> {
  const { orderId } = await params;
  const { key: orderKey } = await searchParams;

  if (!orderId || !orderKey) return notFound();

  const { storeSettings } = await getBranding();
  const mode = normalizeCheckoutMode(storeSettings.checkoutType);
  if (mode !== "quote") {
    redirect(
      `/checkout/success/${encodeURIComponent(orderId)}?key=${encodeURIComponent(orderKey)}`,
    );
  }

  const cookieStore = await cookies();
  const cookieDetails = parseQuoteDetailsCookie(
    cookieStore.get(QUOTE_DETAILS_COOKIE)?.value,
  );

  let order: Awaited<ReturnType<typeof getOrderAction>> = null;
  try {
    order = await getOrderAction(
      orderId,
      orderKey,
      cookieDetails?.email ?? undefined,
    );
  } catch (orderErr) {
    const msg = orderErr instanceof Error ? orderErr.message : "";
    if (
      msg.includes("Invalid order") ||
      msg.includes("invalid_order") ||
      msg.includes("Invalid order ID or key") ||
      msg.includes("not found")
    ) {
      redirect("/quote/error?reason=session_expired");
    }
    throw orderErr;
  }

  if (!order) return notFound();

  const orderDetails = detailsFromOrder(order);
  const details: QuoteFormDetails = {
    email: cookieDetails?.email || orderDetails.email,
    firstName: cookieDetails?.firstName || orderDetails.firstName,
    lastName: cookieDetails?.lastName || orderDetails.lastName,
    phone: cookieDetails?.phone || orderDetails.phone,
    company: cookieDetails?.company || orderDetails.company,
    industry: cookieDetails?.industry || orderDetails.industry,
    state: cookieDetails?.state || orderDetails.state,
    comments: cookieDetails?.comments ?? "",
  };

  return (
    <div className="bg-brand-bg text-brand-fg">
      <ClearCart />
      <QuoteConfirmation
        orderNumber={order.orderNumber}
        firstName={details.firstName}
        items={order.items.map((item) => ({
          key: item.key,
          name: stripTitleMarkers(item.name),
          quantity: item.quantity,
          images: item.images,
          variation: item.variation ?? [],
          giftCard: item.giftCard ?? null,
        }))}
        details={details}
      />
    </div>
  );
}
