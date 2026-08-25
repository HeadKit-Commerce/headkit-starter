import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { InstantLink } from "@/components/headkit-ui/instant-link";

/**
 * Regression cover for `InstantLink`'s prop-forwarding contract.
 *
 * `InstantLink` routes every non-app href (`#`, `tel:`, `mailto:`, absolute
 * http(s)) down a plain `<a>` branch, and that branch used to render
 * `<a href className>` and nothing else — every other prop it was handed was
 * silently dropped.
 *
 * That forwarding is load-bearing wherever `InstantLink` is an `asChild` target
 * or receives handlers for a non-app href, because the parent injects its wiring
 * through the child's props:
 *   - `MegaMenu`'s `NavigationMenuLink asChild > InstantLink` for `#` / `tel:`
 *     CHILD links (navigation-bar.tsx), which dropped Radix's dismiss handler.
 *   - `MobileMenuItem`'s `onClick={onSelect}` on non-app-href links, which
 *     closes the mobile sheet.
 *
 * A top-level `#` dropdown PARENT is no longer this shape: `DesktopMenuSection`
 * renders those as a plain Radix `<button>` with no href, and
 * `navigation-bar.test.tsx` owns that path. The `NavigationMenuTrigger asChild`
 * tree below is kept as a direct test of the forwarding contract itself — the
 * strictest `asChild` consumer, and the shape the original defect was found in.
 *
 * These assert the prop plumbing rather than a click, because the defect was
 * visible in server-rendered markup: on the live storefront the broken item
 * carried neither `data-state` nor `data-radix-collection-item`, while every
 * working sibling carried both.
 */

// next/link is only reached on the in-app branch; a passthrough keeps this a
// node-environment render with no router.
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

function renderTrigger(href: string): string {
  return renderToStaticMarkup(
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger asChild>
            <InstantLink href={href} pendingVariant="text">
              Events
            </InstantLink>
          </NavigationMenuTrigger>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>,
  );
}

describe("InstantLink as a Radix asChild target", () => {
  it("forwards injected asChild wiring for a '#' href", () => {
    const html = renderTrigger("#");

    // The wiring Radix injects through props. Without prop forwarding the
    // anchor rendered bare and every injected handler was lost.
    expect(html).toContain('data-state="closed"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("data-radix-collection-item");
    expect(html).toContain('href="#"');
  });

  it("forwards the same wiring for an in-app href", () => {
    // Guards the assertion above against being trivially true: the in-app
    // branch ('/booths') must produce the same injected markup.
    const html = renderTrigger("/booths");

    expect(html).toContain('data-state="closed"');
    expect(html).toContain("data-radix-collection-item");
  });

  it("forwards handlers and ARIA to a tel: link", () => {
    const html = renderToStaticMarkup(
      <InstantLink
        href="tel:1300883919"
        aria-label="Call us"
        data-testid="phone"
      >
        Call
      </InstantLink>,
    );

    expect(html).toContain('href="tel:1300883919"');
    expect(html).toContain('aria-label="Call us"');
    expect(html).toContain('data-testid="phone"');
  });

  it("does not leak next/link-only props onto the DOM anchor", () => {
    const html = renderToStaticMarkup(
      <InstantLink href="#" replace scroll={false} prefetch={false}>
        Events
      </InstantLink>,
    );

    // React would warn (and the attribute would ship) if these reached <a>.
    expect(html).not.toContain("replace");
    expect(html).not.toContain("scroll");
    expect(html).not.toContain("prefetch");
  });

  it("normalizes absolute storefront URLs to in-app Link paths", () => {
    const html = renderToStaticMarkup(
      <InstantLink href="https://velvet.headkit.app/shop">Shop</InstantLink>,
    );

    expect(html).toContain('href="/shop"');
    expect(html).not.toContain("velvet.headkit.app");
  });
});
