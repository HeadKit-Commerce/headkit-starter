export interface GiftCardDisplay {
  recipients: string[];
  from?: string | null;
  message?: string | null;
  deliveryDate?: string | null;
}

interface GiftCardDetailsProps {
  giftCard: GiftCardDisplay;
}

/**
 * GiftCardDetails renders the buyer-facing gift-card personalization (To / From
 * / message / Delivery) in a subtle branded panel. Shared across the order
 * confirmation line item, the cart drawer, and the checkout order summary so the
 * block looks identical everywhere. A missing/blank deliveryDate renders as
 * "Now" (immediate send).
 */
export function GiftCardDetails({ giftCard }: GiftCardDetailsProps) {
  return (
    <div className="rounded-[3px] bg-primary/5 px-3 py-2 text-xs text-gray-600 space-y-0.5">
      <p className="font-semibold text-primary">Gift card</p>
      {giftCard.recipients.length > 0 && (
        <p>
          <span className="text-gray-400">To:</span>{" "}
          {giftCard.recipients.join(", ")}
        </p>
      )}
      {giftCard.from && (
        <p>
          <span className="text-gray-400">From:</span> {giftCard.from}
        </p>
      )}
      {giftCard.message && (
        <p className="italic text-gray-500">“{giftCard.message}”</p>
      )}
      <p>
        <span className="text-gray-400">Delivery:</span>{" "}
        {giftCard.deliveryDate?.trim() ? giftCard.deliveryDate : "Now"}
      </p>
    </div>
  );
}
