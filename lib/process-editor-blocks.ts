/**
 * processEditorBlocks
 *
 * Parses the WordPress rendered `page.content` HTML into an EditorBlock[]
 * compatible with the BlockEditor component, then merges in the product data
 * that the commerce service already resolved from each editor block.
 *
 * The WP `/headkit/v2/homepage` endpoint embeds all visual metadata
 * (title, description, button, CSS classes) only in the rendered HTML —
 * not in editorBlocks[].attrs.  Products are the one thing that come
 * structured from the API rather than the HTML, so we take them from
 * rawEditorBlocks[i].products at the same index.
 *
 * Mirrors the approach of headkit-store-template's processRenderedContent.
 */

import type { EditorBlock, Product, ContentButton } from "@headkit/sdk";

type RawEditorBlock = {
  products?: unknown[];
};

/**
 * Parse rendered WordPress HTML into EditorBlock[] and attach products from
 * the parallel rawEditorBlocks array.
 */
export function processEditorBlocks(
  html: string,
  rawEditorBlocks: RawEditorBlock[],
): EditorBlock[] {
  if (!html) return [];

  const result: EditorBlock[] = [];

  // Each headkit section is a wp-block-group with "headkit-block-section".
  // The outer closing </div></div> ends the inner-container + the group.
  const sectionRegex =
    /<div\s+class="([^"]*headkit-block-section[^"]*)"[^>]*>\s*<div\s+class="wp-block-group__inner-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>(?=\s*(?:<div\s+class="[^"]*headkit-block-section|$))/gi;

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = sectionRegex.exec(html)) !== null) {
    const classAttr = match[1];
    const innerHtml = match[2];
    if (classAttr === undefined || innerHtml === undefined) continue;
    const classList = classAttr.split(/\s+/).filter(Boolean);

    // Section slot: first class starting with "section-", default "section-1".
    // WP stores headlit blocks have no section-X class by default so all
    // blocks land in section-1 unless the admin adds one explicitly.
    const section =
      classList.find((c) => c.startsWith("section-")) ?? "section-1";

    result.push({
      name: "",
      cssClasses: classList,
      section,
      title: extractTitle(innerHtml),
      description: extractDescription(innerHtml, classList),
      button: extractButton(innerHtml),
      products: (rawEditorBlocks[index]?.products ?? []) as Product[],
    });

    index++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extraction helpers (ported from store-template processRenderedContent)
// ---------------------------------------------------------------------------

function extractTitle(html: string): string {
  const m = html.match(
    /<h[1-6][^>]*class="[^"]*headkit-block-title[^"]*"[^>]*>([^<]*)<\/h[1-6]>/i,
  );
  const cap1 = m?.[1];
  return cap1 !== undefined ? decodeEntities(cap1.trim()) : "";
}

function extractDescription(html: string, classList: string[]): string {
  // Primary: explicit headkit-block-description paragraph(s)
  const descRe =
    /<p[^>]*class="[^"]*headkit-block-description[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let description = "";
  let dm: RegExpExecArray | null;
  while ((dm = descRe.exec(html)) !== null) {
    const cap = dm[1];
    if (cap !== undefined)
      description += `<p>${decodeEntities(cap.trim())}</p>`;
  }
  if (description) return description;

  // Fallback for headkit-hilight: collect paragraphs from the first column
  if (classList.includes("headkit-hilight")) {
    const colM = html.match(
      /<div\s+class="wp-block-column[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    );
    if (colM) {
      const colHtml = colM[1];
      if (colHtml === undefined) return description;
      const pRe = /<p(?:\s+[^>]*)?>(?!<)([\s\S]*?)<\/p>/gi;
      let pm: RegExpExecArray | null;
      while ((pm = pRe.exec(colHtml)) !== null) {
        const text = pm[1];
        if (text !== undefined && text.trim())
          description += `<p>${text.trim()}</p>`;
      }
    }
  }

  return description;
}

function extractButton(html: string): ContentButton | null {
  // Pattern 1: href before target
  const re1 =
    /<div[^>]*class="[^"]*headkit-block-button[^"]*"[^>]*>\s*<a[^>]*class="[^"]*wp-block-button__link[^"]*"[^>]*href="([^"]*)"[^>]*(?:target="([^"]*)")?[^>]*>([^<]*)<\/a>/i;
  const m1 = html.match(re1);
  if (m1) {
    return {
      url: decodeEntities(m1[1] ?? ""),
      linkTarget: m1[2] ?? "",
      text: decodeEntities(m1[3]?.trim() ?? ""),
    };
  }

  // Pattern 2: target before href
  const re2 =
    /<div[^>]*class="[^"]*headkit-block-button[^"]*"[^>]*>\s*<a[^>]*class="[^"]*wp-block-button__link[^"]*"[^>]*(?:target="([^"]*)")?[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
  const m2 = html.match(re2);
  if (m2) {
    return {
      url: decodeEntities(m2[2] ?? ""),
      linkTarget: m2[1] ?? "",
      text: decodeEntities(m2[3]?.trim() ?? ""),
    };
  }

  // Pattern 3: flexible — any href inside headkit-block-button
  const re3 =
    /<div[^>]*class="[^"]*headkit-block-button[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
  const m3 = html.match(re3);
  if (m3) {
    const targetM = html.match(/target="([^"]*)"/i);
    return {
      url: decodeEntities(m3[1] ?? ""),
      linkTarget: targetM?.[1] ?? "",
      text: decodeEntities(m3[2]?.trim() ?? ""),
    };
  }

  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&#036;/g, "$")
    .replace(/&nbsp;/g, " ");
}
