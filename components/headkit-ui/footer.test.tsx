import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer } from "@/components/headkit-ui/footer";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt ?? ""}
      src={typeof props.src === "string" ? props.src : ""}
    />
  ),
}));

describe("Footer menu InstantLink", () => {
  it("opens absolute Instagram menu links in a new tab", () => {
    const html = renderToStaticMarkup(
      <Footer
        siteName="Velvet"
        menus={[
          {
            location: "FOOTER",
            name: "Follow",
            items: [
              {
                id: "ig",
                label: "Instagram",
                uri: "https://www.instagram.com/shopvelvet.co",
                target: null,
              },
              {
                id: "shop",
                label: "Shop",
                uri: "/shop",
                target: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain('href="https://www.instagram.com/shopvelvet.co"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // In-app shop stays same-document InstantLink (no forced blank).
    expect(html).toMatch(/href="\/shop"[^>]*>Shop</);
  });

  it("respects an explicit CMS target=_self on social links", () => {
    const html = renderToStaticMarkup(
      <Footer
        siteName="Velvet"
        menus={[
          {
            location: "FOOTER",
            name: "Follow",
            items: [
              {
                id: "ig",
                label: "Instagram",
                uri: "https://www.instagram.com/shopvelvet.co",
                target: "_self",
              },
            ],
          },
        ]}
      />,
    );

    const ig = html.match(
      /<a[^>]*href="https:\/\/www\.instagram\.com\/shopvelvet\.co"[^>]*>/,
    );
    expect(ig?.[0]).toContain('target="_self"');
    expect(ig?.[0]).not.toContain('target="_blank"');
  });
});
