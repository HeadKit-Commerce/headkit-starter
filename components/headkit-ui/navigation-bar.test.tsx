import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NavigationBar,
  type NavMenuItem,
} from "@/components/headkit-ui/navigation-bar";

/**
 * Desktop nav: every WordPress parent that HAS children must render a dropdown
 * trigger, including the ones whose Custom Link URL is `#`.
 *
 * Shaped on Pebblr's real PRIMARY menu (headkit/v2/menus/location/primary):
 * four parents with children, of which "Events" is authored as a `#` Custom
 * Link, plus one childless leaf. That store shipped Events as a flat top-level
 * link while its three siblings opened correctly — the asymmetry this locks.
 *
 * Radix keeps `NavigationMenuContent` unmounted until the menu opens, so the
 * child links themselves are absent from server markup for working and broken
 * parents alike. The trigger is therefore the only server-observable proof that
 * the subtree was wired, and it is the exact signal the live-site diagnosis
 * used: the broken parent carried neither `data-state` nor
 * `data-radix-collection-item`, both siblings carried both.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

vi.mock("@/components/headkit-ui/header-actions", () => ({
  HeaderActions: () => <div data-stub="header-actions" />,
  MobileHeaderActions: () => <div data-stub="mobile-header-actions" />,
}));

vi.mock("@/components/headkit-ui/cart-drawer", () => ({
  CartTriggerButton: () => <button type="button" data-stub="cart" />,
}));

const leaf = (id: string, label: string, uri: string): NavMenuItem => ({
  id,
  label,
  uri,
  description: null,
  cssClasses: [],
  children: [],
});

const PEBBLR_PRIMARY: NavMenuItem[] = [
  {
    ...leaf("1982", "Photobooth Packages", "/packages/"),
    children: [leaf("2557", "Silver Package", "/silver-package/")],
  },
  {
    ...leaf("2594", "Booths", "/booths/"),
    children: [leaf("2585", "Open Photo Booth", "/open-photo-booth/")],
  },
  {
    // The regression: a dropdown-only parent authored as a `#` Custom Link.
    ...leaf("1814", "Events", "#"),
    children: [
      leaf("1956", "Birthdays", "/birthdays/"),
      leaf("1969", "Graduations", "/graduations/"),
    ],
  },
  {
    ...leaf("3569", "Customise", "/"),
    children: [leaf("3570", "Backdrop Designs", "/backdrop-designs/")],
  },
  leaf("1874", "FAQ", "/faq/"),
];

function renderNav(): string {
  return renderToStaticMarkup(
    <NavigationBar
      primaryMenuItems={PEBBLR_PRIMARY}
      logo={<span>Pebblr</span>}
    />,
  );
}

/** The `<li>` wrapping one desktop root item, by visible label. */
function desktopItem(html: string, label: string): string {
  const items = html.match(/<li class="hidden xl:flex">[\s\S]*?<\/li>/g) ?? [];
  const found = items.find((item) => item.includes(`>${label}<`));
  if (!found) {
    throw new Error(`no desktop nav item rendered for ${label}`);
  }
  return found;
}

/**
 * The opening tag of the interactive element for one desktop root item —
 * `<button>` for a dropdown-only parent, `<a>` for anything navigable.
 */
function rootControl(html: string, label: string): string {
  const item = desktopItem(html, label);
  const tag = item.match(/<(?:button|a)\b[^>]*>/);
  if (!tag) {
    throw new Error(`no button or anchor rendered for ${label}`);
  }
  return tag[0];
}

describe("NavigationBar desktop dropdowns", () => {
  it("wires a dropdown trigger for the '#' parent without an href", () => {
    const events = rootControl(renderNav(), "Events");

    expect(events).toMatch(/^<button\b/);
    expect(events).toContain('data-state="closed"');
    expect(events).toContain("data-radix-collection-item");
    expect(events).toContain('aria-expanded="false"');
    // No href means the browser has no fragment to follow: clicking "Events"
    // opens the menu without pushing `/#` or scrolling the page to the top.
    expect(events).not.toContain("href");
  });

  it("keeps a navigable parent an anchor carrying its href", () => {
    const packages = rootControl(renderNav(), "Photobooth Packages");

    expect(packages).toMatch(/^<a\b/);
    expect(packages).toContain('href="/packages"');
    expect(packages).toContain('data-state="closed"');
    expect(packages).toContain("data-radix-collection-item");
    expect(packages).toContain('aria-expanded="false"');
  });

  it("wires a trigger for every parent with children, and none without", () => {
    const html = renderNav();
    const hasTrigger = (label: string): boolean =>
      rootControl(html, label).includes('data-state="closed"');

    // All four WordPress parents that carry children, across both element
    // types: "Events" is a `#` button, the other three are anchors.
    expect(hasTrigger("Photobooth Packages")).toBe(true);
    expect(hasTrigger("Booths")).toBe(true);
    expect(hasTrigger("Events")).toBe(true);
    expect(hasTrigger("Customise")).toBe(true);
    // The childless leaf stays a plain link.
    expect(hasTrigger("FAQ")).toBe(false);
  });
});
