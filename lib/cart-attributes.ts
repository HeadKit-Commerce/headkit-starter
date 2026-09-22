/** Shopify order Additional details key for the packaging radio. */
export const PACKAGING_ATTRIBUTE_KEY = "Packaging";

/** Shopify order Additional details key for the complimentary gift message. */
export const GIFT_MESSAGE_ATTRIBUTE_KEY = "Gift message";

/** Shopper-facing cap. The commerce provider truncates at 255 runes. */
export const GIFT_MESSAGE_MAX_LENGTH = 250;

export interface CartAttributePair {
  key: string;
  value: string;
}

export interface PackagingOptionRef {
  id: string;
  title: string;
}

let writeChain: Promise<void> = Promise.resolve();

/** Attributes the shopper is allowed to see. Internal `_` stamps stay server-side. */
export function shopperCartAttributes(
  attributes: readonly CartAttributePair[] | null | undefined,
): CartAttributePair[] {
  return (attributes ?? []).filter(
    (attribute) => attribute.key.length > 0 && !attribute.key.startsWith("_"),
  );
}

export function attributeValue(
  attributes: readonly CartAttributePair[] | null | undefined,
  key: string,
): string {
  return (
    shopperCartAttributes(attributes).find((attribute) => attribute.key === key)
      ?.value ?? ""
  );
}

/**
 * Selected packaging option id. A stored title wins; otherwise the first
 * option, which the drawer writes before checkout.
 */
export function packagingSelection(
  attributes: readonly CartAttributePair[] | null | undefined,
  options: readonly PackagingOptionRef[],
): string {
  const first = options[0];
  if (!first) return "";
  const current = attributeValue(attributes, PACKAGING_ATTRIBUTE_KEY);
  const match = options.find((option) => option.title === current);
  return match?.id ?? first.id;
}

export function giftMessageDraft(
  attributes: readonly CartAttributePair[] | null | undefined,
): { checked: boolean; text: string } {
  const text = attributeValue(attributes, GIFT_MESSAGE_ATTRIBUTE_KEY);
  return { checked: text.length > 0, text };
}

export function clampGiftMessage(text: string): string {
  const chars = [...text];
  if (chars.length <= GIFT_MESSAGE_MAX_LENGTH) return text;
  return chars.slice(0, GIFT_MESSAGE_MAX_LENGTH).join("");
}

/**
 * Serialize attribute mutations. Shopify replaces the whole attribute set,
 * so overlapping writes would drop a key the other call had just merged.
 */
export function enqueueCartAttributeWrite(
  task: () => Promise<void>,
): Promise<void> {
  const next = writeChain.then(task, task);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** Resolves after every queued attribute write, including ones still running. */
export function flushCartAttributeWrites(): Promise<void> {
  return writeChain;
}

/** Tests only — drop a chain left behind by a failed write. */
export function resetCartAttributeWritesForTests(): void {
  writeChain = Promise.resolve();
}
