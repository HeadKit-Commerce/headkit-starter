import { describe, expect, it } from "vitest";
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
  const output = sanitizeContent(MALICIOUS_FIXTURE);

  it("keeps the block image and its wp-block-image class", () => {
    expect(output).toContain("<img");
    expect(output).toContain("wp-block-image");
    expect(output).toContain(
      "http://localhost:8090/wp-content/uploads/sample.jpg",
    );
  });

  it("keeps the table tag and its wp-block-table class", () => {
    expect(output).toContain("<table");
    expect(output).toContain("wp-block-table");
  });

  it("strips <script> elements and the alert payload entirely", () => {
    expect(output).not.toContain("<script");
    expect(output).not.toContain("alert(");
  });

  it("strips on* handler attributes and javascript: URIs", () => {
    expect(output).not.toContain("onclick");
    expect(output).not.toContain("javascript:");
  });

  it("keeps HeadKit Gravity Forms markers (data-form-id) for storefront hydration", () => {
    const marker =
      '<div class="headkit-gravity-form" data-form-id="1" data-headkit-gf="1"></div>';
    const cleaned = sanitizeContent(`<p>Hi</p>${marker}`);
    expect(cleaned).toContain('data-form-id="1"');
    expect(cleaned).toContain("headkit-gravity-form");
  });
});
