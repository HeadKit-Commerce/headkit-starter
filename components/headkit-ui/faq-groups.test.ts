import { describe, expect, it } from "vitest";
import type { FaqItem } from "@headkit/sdk";
import { groupFaqsByTopic } from "./faq-groups";

function faq(
  id: string,
  question: string,
  topic?: string | null,
  topicSlug?: string | null,
): FaqItem {
  return {
    id,
    question,
    answer: `<p>${question}</p>`,
    topic: topic ?? null,
    topicSlug: topicSlug ?? null,
  };
}

describe("groupFaqsByTopic", () => {
  it("returns a single untitled group when no topics are set", () => {
    const groups = groupFaqsByTopic([faq("1", "Q1"), faq("2", "Q2")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.topic).toBeNull();
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("preserves first-appearance topic order and keeps items ordered", () => {
    const groups = groupFaqsByTopic([
      faq("1", "Ship 1", "Shipping", "shipping"),
      faq("2", "Return 1", "Returns", "returns"),
      faq("3", "Ship 2", "Shipping", "shipping"),
    ]);
    expect(groups.map((g) => g.topicSlug)).toEqual(["shipping", "returns"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["1", "3"]);
    expect(groups[0]?.topic).toBe("Shipping");
  });

  it("moves uncategorized FAQs to the end without an H2 topic", () => {
    const groups = groupFaqsByTopic([
      faq("1", "Loose", null, null),
      faq("2", "Ship", "Shipping", "shipping"),
    ]);
    expect(groups.map((g) => g.topicSlug)).toEqual(["shipping", null]);
    expect(groups[1]?.topic).toBeNull();
    expect(groups[1]?.items[0]?.id).toBe("1");
  });
});
