import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: (): void => undefined,
  cacheTag: (): void => undefined,
}));

import { sanitizeContent } from "./sanitize-content";

/**
 * R6 / T-08-02 sanitize boundary (plan 08-05).
 *
 * sanitizeContent is the XSS allowlist edge applied to untrusted WordPress
 * `content.rendered` HTML before it is injected via dangerouslySetInnerHTML in
 * the shared EditorialContent component. These tests pin the two halves of the
 * contract on one malicious block-authored fixture:
 *   - KEEP the block-faithful surface (img + wp-block-* classes + table tags), and
 *   - STRIP every XSS vector (script, on* handlers, javascript: URIs).
 */

// A single fixture that mixes the legitimate Gutenberg block markup we must keep
// with the XSS vectors we must strip (mirrors the seed-editorial.php wp:html block).
const MALICIOUS_FIXTURE = [
  "<!-- wp:image -->",
  '<figure class="wp-block-image"><img class="wp-block-image" src="http://localhost:8090/wp-content/uploads/sample.jpg" alt="x" /></figure>',
  "<!-- /wp:image -->",
  "<!-- wp:table -->",
  '<figure class="wp-block-table"><table class="wp-block-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table></figure>',
  "<!-- /wp:table -->",
  "<!-- wp:html -->",
  "<script>alert('xss')</script>",
  "<!-- /wp:html -->",
  "<a href=\"javascript:alert('xss')\" onclick=\"alert('xss')\">click</a>",
].join("\n");

describe("sanitizeContent (R6 XSS allowlist)", () => {
  it("keeps the block image and its wp-block-image class", async () => {
    const output = await sanitizeContent(MALICIOUS_FIXTURE);
    expect(output).toContain("<img");
    expect(output).toContain("wp-block-image");
    expect(output).toContain(
      "http://localhost:8090/wp-content/uploads/sample.jpg",
    );
  });

  it("keeps the table tag and its wp-block-table class", async () => {
    const output = await sanitizeContent(MALICIOUS_FIXTURE);
    expect(output).toContain("<table");
    expect(output).toContain("wp-block-table");
  });

  it("strips <script> elements and the alert payload entirely", async () => {
    const output = await sanitizeContent(MALICIOUS_FIXTURE);
    expect(output).not.toContain("<script");
    expect(output).not.toContain("alert(");
  });

  it("strips on* handler attributes and javascript: URIs", async () => {
    const output = await sanitizeContent(MALICIOUS_FIXTURE);
    expect(output).not.toContain("onclick");
    expect(output).not.toContain("javascript:");
  });

  it("keeps HeadKit Gravity Forms markers (data-form-id) for storefront hydration", async () => {
    const marker =
      '<div class="headkit-gravity-form" data-form-id="1" data-headkit-gf="1"></div>';
    const cleaned = await sanitizeContent(`<p>Hi</p>${marker}`);
    expect(cleaned).toContain('data-form-id="1"');
    expect(cleaned).toContain("headkit-gravity-form");
  });

  it("keeps handpicked colourway pins (data-colourway) on product list items", async () => {
    const item =
      '<li class="wc-block-grid__product" data-colourway="navy"><a class="wc-block-grid__product-link" href="https://example.com/product/tee/">Tee</a></li>';
    const cleaned = await sanitizeContent(item);
    expect(cleaned).toContain('data-colourway="navy"');
  });

  it("keeps spacing padding/margin with rem/% and WP spacing presets", async () => {
    const html =
      '<div class="wp-block-group" style="padding-top:2rem;padding-left:var(--wp--preset--spacing--50);margin-bottom:1.5rem;gap:1rem 2%">x</div>';
    const cleaned = await sanitizeContent(html);
    expect(cleaned).toContain("padding-top:2rem");
    expect(cleaned).toContain("var(--wp--preset--spacing--50)");
    expect(cleaned).toContain("margin-bottom:1.5rem");
    expect(cleaned).toContain("gap:1rem 2%");
  });

  it("strips viewport spacing units (vw/vh) that break the starter grid", async () => {
    const html =
      '<div class="wp-block-group" style="padding-top:10vh;margin-left:5vw;padding-bottom:2rem">x</div>';
    const cleaned = await sanitizeContent(html);
    expect(cleaned).not.toContain("10vh");
    expect(cleaned).not.toContain("5vw");
    expect(cleaned).toContain("padding-bottom:2rem");
  });

  it("keeps border width/style but strips border-color and border-radius", async () => {
    const html =
      '<div class="wp-block-group has-border-color" style="border-width:2px;border-style:solid;border-color:#ff0000;border-radius:99px">x</div>';
    const cleaned = await sanitizeContent(html);
    expect(cleaned).toContain("border-width:2px");
    expect(cleaned).toContain("border-style:solid");
    // Class may remain (CSS overrides palette); inline color/radius must go.
    expect(cleaned).not.toMatch(/style="[^"]*border-color/);
    expect(cleaned).not.toContain("#ff0000");
    expect(cleaned).not.toMatch(/style="[^"]*border-radius/);
    expect(cleaned).not.toContain("99px");
  });

  it("keeps image aspect-ratio and object-fit (WP Dimensions)", async () => {
    const html =
      '<figure class="wp-block-image" style="aspect-ratio:16/9;height:unset;min-height:unset"><img src="https://example.com/a.jpg" alt="" style="object-fit:cover;width:100%;height:100%" /></figure>';
    const cleaned = await sanitizeContent(html);
    expect(cleaned).toContain("aspect-ratio:16/9");
    expect(cleaned).toContain("height:unset");
    expect(cleaned).toContain("min-height:unset");
    expect(cleaned).toContain("object-fit:cover");
  });

  it("keeps spaced aspect-ratio values and preset vars", async () => {
    const html =
      '<figure class="wp-block-image" style="aspect-ratio:16 / 9"><img src="https://example.com/a.jpg" alt="" /></figure>' +
      '<figure class="wp-block-image" style="aspect-ratio:var(--wp--preset--aspect-ratio--square)"><img src="https://example.com/b.jpg" alt="" /></figure>';
    const cleaned = await sanitizeContent(html);
    expect(cleaned).toContain("aspect-ratio:16 / 9");
    expect(cleaned).toContain("var(--wp--preset--aspect-ratio--square)");
  });
});
