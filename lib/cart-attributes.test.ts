import { describe, expect, it } from "vitest";
import {
  clampGiftMessage,
  enqueueCartAttributeWrite,
  GIFT_MESSAGE_MAX_LENGTH,
  giftMessageDraft,
  packagingSelection,
  resetCartAttributeWritesForTests,
} from "./cart-attributes";

const OPTIONS = [
  { id: "signature-box", title: "The Signature Box" },
  { id: "sustainable-box", title: "The Sustainable Box" },
];

describe("packagingSelection", () => {
  it("selects the first option when nothing is stored", () => {
    expect(packagingSelection([], OPTIONS)).toBe("signature-box");
  });

  it("matches a stored title", () => {
    expect(
      packagingSelection(
        [{ key: "Packaging", value: "The Sustainable Box" }],
        OPTIONS,
      ),
    ).toBe("sustainable-box");
  });
});

describe("giftMessageDraft", () => {
  it("is closed when the attribute is missing", () => {
    expect(giftMessageDraft([])).toEqual({ checked: false, text: "" });
  });

  it("opens when a message is stored", () => {
    expect(
      giftMessageDraft([{ key: "Gift message", value: "Happy birthday" }]),
    ).toEqual({ checked: true, text: "Happy birthday" });
  });
});

describe("clampGiftMessage", () => {
  it("keeps the first 250 code points", () => {
    const text = "あ".repeat(GIFT_MESSAGE_MAX_LENGTH + 4);
    expect([...clampGiftMessage(text)]).toHaveLength(GIFT_MESSAGE_MAX_LENGTH);
  });
});

describe("enqueueCartAttributeWrite", () => {
  it("runs writes in order", async () => {
    resetCartAttributeWritesForTests();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queued = Promise.all([
      enqueueCartAttributeWrite(async () => {
        await first;
        order.push("first");
      }),
      enqueueCartAttributeWrite(async () => {
        order.push("second");
      }),
    ]);
    releaseFirst?.();
    await queued;
    expect(order).toEqual(["first", "second"]);
  });
});
