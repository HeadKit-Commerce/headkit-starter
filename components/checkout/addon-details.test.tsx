import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AddonDetails, type AddonDisplay } from "./addon-details";

/**
 * `AddonDetails` — the cart / checkout / confirmation / account echo of the
 * shopper's add-on selections (PAO-03), and the same component's silence when
 * there are none (PAO-04).
 *
 * Rendered through `react-dom/server` rather than a DOM testing library: the
 * starter's vitest environment is `node` and this phase's dependency budget is
 * zero (UI-SPEC § Registry Safety). `app/checkout/finalising/page.test.tsx` is
 * the in-repo precedent for the technique.
 *
 * Four properties are load-bearing and none of them is assumed:
 *
 *   1. an empty selection list contributes **no element at all** — not an empty
 *      div, not a zero-height wrapper. A wrapper is invisible to a presence
 *      check but shifts every line on four surfaces;
 *   2. values a shopper typed are HTML-entity **decoded** (14.1-03 measured the
 *      order side returning `Sam &amp; Alex, 12 Dec`) and then rendered as React
 *      children, so they come back **escaped**. Decode-then-escape, never
 *      raw HTML;
 *   3. **no money appears.** A flat fee is reported by the Store API divided by
 *      line quantity, and quantity-based / percentage-based add-ons produce no
 *      per-add-on figure at all, so any per-add-on price would misquote
 *      (UI-SPEC U-03, measurement-driven);
 *   4. the panel's three off-scale spacing values are **byte-identical** to
 *      `gift-card-details.tsx`. That identity is the feature — the two panels
 *      must be indistinguishable when a cart carries both (UI-SPEC Dimension 5
 *      FLAG). A test, not a comment, is what stops a later reviewer
 *      "normalising" them to the 4px scale.
 */

/** The real order-230 selections, as the gateway returns them (measured). */
const ORDER_230: AddonDisplay[] = [
  { addonId: "1900000001", name: "Add-ons", value: "Animated Welcome Screen" },
  {
    addonId: "1900000002",
    name: "Guest Book Service",
    value: "Hardcover Book",
  },
  { addonId: "1900000003", name: "Backdrop Design", value: "Sequin Gold" },
  {
    addonId: "1900000004",
    name: "Event Message",
    value: "Sam &amp; Alex, 12 Dec",
  },
];

function render(addons: AddonDisplay[]): string {
  return renderToStaticMarkup(<AddonDetails addons={addons} />);
}

const SRC_DIR = resolve(__dirname);
const addonSource = readFileSync(resolve(SRC_DIR, "addon-details.tsx"), "utf8");
const giftCardSource = readFileSync(
  resolve(SRC_DIR, "gift-card-details.tsx"),
  "utf8",
);

/** The panel's outermost `className="…"` literal, verbatim. */
function panelClasses(source: string): string {
  const match = /className="([^"]*rounded-\[3px\][^"]*)"/.exec(source);
  if (!match?.[1]) throw new Error("no panel className found in source");
  return match[1];
}

/** One declared class whose prefix matches, e.g. `px-` → `px-3`. */
function classWithPrefix(classes: string, prefix: string): string {
  const found = classes.split(/\s+/).find((c) => c.startsWith(prefix));
  if (!found)
    throw new Error(`no class starting with "${prefix}" in ${classes}`);
  return found;
}

describe("AddonDetails — the empty case (PAO-04)", () => {
  it("renders zero DOM nodes for an empty selection list", () => {
    expect(render([])).toBe("");
  });

  it("renders no wrapper, no heading and no whitespace for an empty list", () => {
    const markup = render([]);
    expect(markup).not.toContain("<div");
    expect(markup).not.toContain("Options");
    expect(markup).toHaveLength(0);
  });
});

describe("AddonDetails — the shopper sees what they configured", () => {
  it("renders the panel title the copywriting contract specifies", () => {
    expect(render(ORDER_230)).toContain(">Options</p>");
  });

  it("renders every selection, in the order received", () => {
    const markup = render(ORDER_230);
    for (const a of ORDER_230) expect(markup).toContain(a.name);
    const positions = ORDER_230.map((a) => markup.indexOf(a.name));
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });

  it("pairs each group name with its chosen value", () => {
    const markup = render([ORDER_230[1]!]);
    expect(markup).toContain("Guest Book Service:");
    expect(markup).toContain("Hardcover Book");
  });

  it("renders one row per selection even when a group repeats (checkbox groups)", () => {
    const markup = render([
      { addonId: "1900000103", name: "Extras", value: "Extra Prints" },
      { addonId: "1900000103", name: "Extras", value: "USB Copy" },
    ]);
    expect(markup).toContain("Extra Prints");
    expect(markup).toContain("USB Copy");
    expect(markup.split("Extras:").length - 1).toBe(2);
  });
});

describe("AddonDetails — decode, then escape", () => {
  it("decodes the entity-encoded value the order path really returns", () => {
    // Measured on local order 230 through the gateway: the value arrives as
    // `Sam &amp; Alex, 12 Dec`. Decoded it is `Sam & Alex, 12 Dec`, which React
    // re-escapes to `Sam &amp; Alex, 12 Dec`. WITHOUT the decode the markup
    // would carry `&amp;amp;` — which is exactly what this asserts against.
    const markup = render([ORDER_230[3]!]);
    expect(markup).toContain("Sam &amp; Alex, 12 Dec");
    expect(markup).not.toContain("&amp;amp;");
  });

  it("decodes an entity whose decoded form is not re-escaped, so the decode is visible", () => {
    const markup = render([
      { addonId: "1", name: "Event Dates", value: "12 &ndash; 14 Dec" },
    ]);
    expect(markup).toContain("12 – 14 Dec");
    expect(markup).not.toContain("ndash");
  });

  it("decodes the group name too, not only the value", () => {
    const markup = render([
      { addonId: "1", name: "Rob &amp; Sam&#039;s picks", value: "Yes" },
    ]);
    expect(markup).toContain("Rob &amp; Sam&#x27;s picks");
    expect(markup).not.toContain("&amp;#039;");
  });

  it("escapes a shopper-supplied value that contains markup", () => {
    const markup = render([
      {
        addonId: "1",
        name: "Message",
        value: '<img src=x onerror="alert(1)">',
      },
    ]);
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain('onerror="alert');
  });

  it("escapes a shopper-supplied value that is already double-encoded", () => {
    // `&amp;lt;script&amp;gt;` decodes once to `&lt;script&gt;`, which React
    // escapes back to `&amp;lt;script&amp;gt;`. A single decode never yields a
    // live tag, which is the property that matters.
    const markup = render([
      { addonId: "1", name: "Note", value: "&amp;lt;script&amp;gt;" },
    ]);
    expect(markup).not.toContain("<script");
  });

  it("never uses a raw-HTML render prop", () => {
    expect(addonSource).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("AddonDetails — no money on the row (UI-SPEC U-03)", () => {
  it("renders no price even when the selection carries one", () => {
    // The SDK's selection type carries `price` / `priceType` / `fieldType`;
    // the panel's own display type deliberately does not. The wider shape is
    // what the call sites really pass, and the component must ignore the extra
    // fields rather than find a use for them.
    const priced: Array<
      AddonDisplay & { price: string; priceType: string; fieldType: string }
    > = [
      {
        addonId: "1900000002",
        name: "Guest Book Service",
        value: "Hardcover Book",
        price: "50",
        priceType: "flat_fee",
        fieldType: "multiple_choice",
      },
    ];
    const markup = renderToStaticMarkup(<AddonDetails addons={priced} />);
    expect(markup).toContain("Hardcover Book");
    expect(markup).not.toContain("50");
    expect(markup).not.toContain("$");
    expect(markup).not.toContain("flat_fee");
  });

  it("calls no currency formatter and reads no price field in its source", () => {
    expect(addonSource).not.toContain("formatPrice");
    expect(addonSource).not.toContain("getFloatVal");
    expect(addonSource).not.toContain("formatAddonPriceSuffix");
    expect(/\.price\b/.test(addonSource)).toBe(false);
    expect(/\.priceType\b/.test(addonSource)).toBe(false);
  });

  it("never branches on fieldType, which is always empty for a placed order", () => {
    expect(/\.fieldType\b/.test(addonSource)).toBe(false);
  });
});

describe("AddonDetails — indistinguishable from the gift-card panel", () => {
  const addonClasses = panelClasses(addonSource);
  const giftClasses = panelClasses(giftCardSource);

  it.each([
    ["corner radius", "rounded-"],
    ["horizontal padding", "px-"],
    ["vertical padding", "py-"],
    ["row gap", "space-y-"],
    ["tinted ground", "bg-"],
    ["meta type size", "text-x"],
  ])("%s is string-identical to gift-card-details.tsx", (_label, prefix) => {
    expect(classWithPrefix(addonClasses, prefix)).toBe(
      classWithPrefix(giftClasses, prefix),
    );
  });

  it("uses the whole gift-card panel class string, in the same order", () => {
    expect(addonClasses).toBe(giftClasses);
  });

  it("gives its title the same weight and colour the gift-card title has", () => {
    expect(addonSource).toContain('className="font-semibold text-primary"');
    expect(giftCardSource).toContain('className="font-semibold text-primary"');
  });

  it("labels its rows with the same muted span the gift-card rows use", () => {
    expect(addonSource).toContain('className="text-gray-400"');
    expect(giftCardSource).toContain('className="text-gray-400"');
  });

  it("names gift-card-details.tsx as the source of the off-scale values", () => {
    expect(addonSource).toContain("gift-card-details.tsx");
  });
});
