import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartDrawerRegions } from "@/components/headkit-ui/cart-drawer-regions";
import { CartDrawerExtras } from "@/components/headkit-ui/cart-drawer-extras";
import type { CartTheme } from "@/lib/store-theme";

const cart: CartTheme = {
  packaging: {
    title: "Packaging choice",
    options: [
      {
        id: "signature-box",
        title: "The Signature Box",
        description:
          "The textured Velvet box, with the signature and the icon cut through the lid, in a colour matched to your towel.",
      },
      {
        id: "sustainable-box",
        title: "The Sustainable Box",
        description:
          "Your order arrives in a recyclable kraft case, lighter to ship and made to be reused.",
      },
    ],
  },
  giftMessage: { label: "Include a complimentary gift message?" },
};

function extras(giftOpen: boolean): string {
  return renderToStaticMarkup(
    <CartDrawerRegions
      scroll={<p>Added towels</p>}
      pinned={
        <CartDrawerExtras
          cart={cart}
          selectedPackagingId="signature-box"
          onPackagingChange={() => undefined}
          giftOpen={giftOpen}
          onGiftOpenChange={() => undefined}
          giftText={giftOpen ? "With love" : ""}
          onGiftTextChange={() => undefined}
        />
      }
      footer={<p>Shipping calculated at checkout</p>}
    />,
  );
}

describe("cart drawer pin", () => {
  it("scrolls the lines and keeps packaging, gift message, and totals pinned", () => {
    const html = extras(false);
    const scroll = html.indexOf("data-cart-scroll");
    const pinned = html.indexOf("data-cart-pinned");
    const footer = html.indexOf("data-cart-footer");
    expect(scroll).toBeGreaterThan(-1);
    expect(pinned).toBeGreaterThan(scroll);
    expect(footer).toBeGreaterThan(pinned);
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("shrink-0");
    expect(html).toContain("Packaging choice");
    expect(html).toContain("The Signature Box");
    expect(html).toContain("The Sustainable Box");
    expect(html).toContain("Include a complimentary gift message?");
    expect(html).not.toContain("Write a note to include with the order");
  });

  it("expands the gift message field when the checkbox is on", () => {
    const html = extras(true);
    expect(html).toContain("Write a note to include with the order");
    expect(html).toContain("With love");
  });

  it("clips packaging thumbnails with the branding corner radius", () => {
    const packaging = cart.packaging;
    const first = packaging?.options[0];
    const second = packaging?.options[1];
    if (!packaging || !first || !second) {
      throw new Error("packaging fixture missing");
    }
    const html = renderToStaticMarkup(
      <CartDrawerExtras
        cart={{
          ...cart,
          packaging: {
            ...packaging,
            options: [{ ...first, image: "/packaging/signature.jpg" }, second],
          },
        }}
        selectedPackagingId="signature-box"
        onPackagingChange={() => undefined}
        giftOpen={false}
        onGiftOpenChange={() => undefined}
        giftText=""
        onGiftTextChange={() => undefined}
      />,
    );
    expect(html).toContain(
      'class="aspect-[4/3] w-full rounded-brand object-cover"',
    );
    expect(html).toContain(
      'class="aspect-[4/3] w-full rounded-brand bg-neutral-200"',
    );
    expect(html).toContain('src="/packaging/signature.jpg"');
    expect(html).not.toContain("w-full rounded ");
    expect(html).not.toContain('w-full rounded"');
  });
});
