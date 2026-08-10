import type { FaqItem } from "@headkit/sdk";

/** A topic section of FAQs for storefront rendering. */
export type FaqTopicGroup = {
  /** Display title for the H2; null when uncategorized. */
  topic: string | null;
  /** Topic slug; null when uncategorized. */
  topicSlug: string | null;
  items: FaqItem[];
};

const UNCATEGORIZED_KEY = "__uncategorized__";

/**
 * Group FAQs by topic while preserving topic order from first appearance
 * in the provider-ordered list (WP menu_order). Uncategorized items go last
 * and render without an H2.
 */
export function groupFaqsByTopic(faqs: FaqItem[]): FaqTopicGroup[] {
  const order: string[] = [];
  const map = new Map<string, FaqTopicGroup>();

  for (const faq of faqs) {
    const slug = faq.topicSlug?.trim() ?? "";
    const key = slug.length > 0 ? slug : UNCATEGORIZED_KEY;
    let group = map.get(key);
    if (!group) {
      const topicName = faq.topic?.trim() ?? "";
      group = {
        topic: key === UNCATEGORIZED_KEY ? null : topicName || slug,
        topicSlug: key === UNCATEGORIZED_KEY ? null : slug,
        items: [],
      };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(faq);
  }

  const sorted = order.filter((k) => k !== UNCATEGORIZED_KEY);
  if (order.includes(UNCATEGORIZED_KEY)) {
    sorted.push(UNCATEGORIZED_KEY);
  }

  return sorted.map((k) => {
    const group = map.get(k);
    if (!group) {
      throw new Error(`faq topic group missing for key ${k}`);
    }
    return group;
  });
}
