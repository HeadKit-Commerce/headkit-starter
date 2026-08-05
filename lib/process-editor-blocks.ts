/**
 * processEditorBlocks / processHomepageContent
 *
 * Parses the WordPress rendered `page.content` HTML into EditorBlock[]
 * compatible with the BlockEditor component, then merges in the product data
 * that the commerce service already resolved from each editor block.
 *
 * The WP `/headkit/v2/homepage` endpoint embeds all visual metadata
 * (title, description, button, CSS classes) only in the rendered HTML —
 * not in editorBlocks[].attrs.  Products (and queryType) come structured from
 * the API, so we take them from rawEditorBlocks[i] at the same index as each
 * headkit-block-section in the HTML.
 *
 * Categories, brands, and posts are hydrated into attrs by the WP theme
 * (attrs.categories / attrs.brands / attrs.posts) and merged onto the
 * processed block for BlockEditor.
 *
 * Segments preserve WordPress document order: HeadKit section groups and
 * leftover Gutenberg HTML are interleaved so the storefront can render CMS
 * content in editor order (not section-1 / leftover / section-2 slots).
 */

import type { EditorBlock, Product, ContentButton } from "@headkit/sdk";

export type RawEditorBlock = {
  products?: unknown[];
  attrs?: Record<string, unknown> | null;
  queryType?: string | null;
};

/** Category shape hydrated into attrs.categories (FeaturedCategory-like). */
export type HydratedCategory = {
  id?: string;
  name: string;
  slug: string;
  uri?: string;
  thumbnail?: string | null;
  description?: string;
};

/** Brand shape hydrated into attrs.brands (FeaturedBrand-like). */
export type HydratedBrand = {
  id?: string;
  name: string;
  slug: string;
  thumbnail?: string | null;
  description?: string;
};

/** Post shape hydrated into attrs.posts (Post summary-like). */
export type HydratedPost = {
  id?: string | number;
  title: string;
  slug: string;
  excerpt?: string;
  date?: string;
  uri?: string | null;
  featuredImage?: {
    src?: string | null;
    alt?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  categories?: Array<{ id?: string; name?: string; slug?: string }>;
};

/** Project shape hydrated into attrs.projects (Project summary-like). */
export type HydratedProject = {
  id?: string | number;
  title: string;
  slug: string;
  excerpt?: string;
  date?: string;
  uri?: string | null;
  location?: string | null;
  featuredImage?: {
    src?: string | null;
    alt?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  brand?: {
    id?: string | number;
    name?: string;
    slug?: string;
    thumbnail?: string | null;
  } | null;
  tags?: Array<{
    id?: string | number;
    name?: string;
    slug?: string;
    count?: number;
  }>;
};

/** Storefront block with optional section HTML for media / passthrough render. */
export type ProcessedEditorBlock = EditorBlock & {
  /** Full outer section markup (sanitized at render time). */
  html?: string;
  /** Product categories from WP hydration (category carousel). */
  categories?: HydratedCategory[];
  /** Brands from WP hydration (brand carousel). */
  brands?: HydratedBrand[];
  /** Posts from WP hydration (post carousel / latest-posts). */
  posts?: HydratedPost[];
  /** Projects from WP hydration (project carousel). */
  projects?: HydratedProject[];
  /** All CTA buttons in the section (callout may have multiple). */
  buttons?: ContentButton[];
};

/** Ordered homepage CMS segment (HeadKit block or leftover HTML). */
export type HomepageSegment =
  | { kind: "block"; block: ProcessedEditorBlock }
  | { kind: "html"; html: string };

export type ProcessedHomepageContent = {
  blocks: ProcessedEditorBlock[];
  /**
   * page.content with headkit-block-section groups removed (concatenated).
   * Prefer `segments` for ordered rendering.
   */
  leftoverHtml: string;
  /** HeadKit sections + leftover HTML in WordPress document order. */
  segments: HomepageSegment[];
};

type ExtractedSection = {
  classAttr: string;
  innerHtml: string;
  fullMatch: string;
  /** Index of the opening tag in the source HTML. */
  start: number;
  /** Index after the closing </div> of this section. */
  end: number;
};

/**
 * Extract headkit-block-section groups with balanced </div> matching so
 * gallery / video-feature / nested columns all work (not only constrained
 * groups with wp-block-group__inner-container).
 */
export function extractHeadkitSections(html: string): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const openRe = /<div\s+class="([^"]*headkit-block-section[^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(html)) !== null) {
    const classAttr = m[1];
    if (classAttr === undefined) continue;

    const start = m.index;
    let i = m.index + m[0].length;
    let depth = 1;

    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf("<div", i);
      const nextClose = html.indexOf("</div>", i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        i = nextClose + 6;
      }
    }

    const fullMatch = html.slice(start, i);
    let innerHtml = html.slice(m.index + m[0].length, i - 6);

    // Unwrap optional WP inner-container for title/description helpers.
    const ic = innerHtml.match(
      /^\s*<div\s+class="wp-block-group__inner-container[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i,
    );
    if (ic?.[1] !== undefined) {
      innerHtml = ic[1];
    }

    sections.push({ classAttr, innerHtml, fullMatch, start, end: i });
    // Continue search after this section to avoid re-matching nested sections.
    openRe.lastIndex = i;
  }

  return sections;
}

function trimLeftoverChunk(html: string): string {
  return html
    .replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/, "")
    .replace(/(?:<!--[\s\S]*?-->\s*)+$/, "")
    .trim();
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function hydrateCategories(raw: unknown): HydratedCategory[] {
  return asRecordArray(raw)
    .map((item): HydratedCategory | null => {
      const name = typeof item["name"] === "string" ? item["name"] : "";
      const slug = typeof item["slug"] === "string" ? item["slug"] : "";
      if (!name || !slug) return null;
      const cat: HydratedCategory = { name, slug };
      if (typeof item["id"] === "string") cat.id = item["id"];
      if (typeof item["uri"] === "string") cat.uri = item["uri"];
      if (typeof item["description"] === "string")
        cat.description = item["description"];
      if (typeof item["thumbnail"] === "string")
        cat.thumbnail = item["thumbnail"];
      else if (item["thumbnail"] === null) cat.thumbnail = null;
      return cat;
    })
    .filter((c): c is HydratedCategory => c !== null);
}

function hydrateBrands(raw: unknown): HydratedBrand[] {
  return asRecordArray(raw)
    .map((item): HydratedBrand | null => {
      const name = typeof item["name"] === "string" ? item["name"] : "";
      const slug = typeof item["slug"] === "string" ? item["slug"] : "";
      if (!name || !slug) return null;
      const brand: HydratedBrand = { name, slug };
      if (typeof item["id"] === "string") brand.id = item["id"];
      if (typeof item["description"] === "string")
        brand.description = item["description"];
      if (typeof item["thumbnail"] === "string")
        brand.thumbnail = item["thumbnail"];
      else if (item["thumbnail"] === null) brand.thumbnail = null;
      return brand;
    })
    .filter((b): b is HydratedBrand => b !== null);
}

function hydratePosts(raw: unknown): HydratedPost[] {
  return asRecordArray(raw)
    .map((item): HydratedPost | null => {
      const title = typeof item["title"] === "string" ? item["title"] : "";
      const slug = typeof item["slug"] === "string" ? item["slug"] : "";
      if (!title || !slug) return null;
      const post: HydratedPost = { title, slug };
      if (typeof item["id"] === "string" || typeof item["id"] === "number")
        post.id = item["id"];
      if (typeof item["excerpt"] === "string") post.excerpt = item["excerpt"];
      if (typeof item["date"] === "string") post.date = item["date"];
      if (typeof item["uri"] === "string") post.uri = item["uri"];
      else if (item["uri"] === null) post.uri = null;

      const fi = item["featuredImage"];
      if (fi && typeof fi === "object" && !Array.isArray(fi)) {
        const img = fi as Record<string, unknown>;
        // Support both flat {src} and nested {node:{sourceUrl}} shapes.
        const node =
          img["node"] && typeof img["node"] === "object"
            ? (img["node"] as Record<string, unknown>)
            : null;
        const src =
          typeof img["src"] === "string"
            ? img["src"]
            : typeof node?.["sourceUrl"] === "string"
              ? node["sourceUrl"]
              : typeof img["sourceUrl"] === "string"
                ? img["sourceUrl"]
                : null;
        post.featuredImage = {
          src,
          alt:
            typeof img["alt"] === "string"
              ? img["alt"]
              : typeof node?.["altText"] === "string"
                ? node["altText"]
                : null,
          width: typeof img["width"] === "number" ? img["width"] : null,
          height: typeof img["height"] === "number" ? img["height"] : null,
        };
      } else if (fi === null) {
        post.featuredImage = null;
      }

      const cats = item["categories"];
      if (Array.isArray(cats)) {
        post.categories = asRecordArray(cats).map((c) => ({
          ...(typeof c["id"] === "string" ? { id: c["id"] } : {}),
          ...(typeof c["name"] === "string" ? { name: c["name"] } : {}),
          ...(typeof c["slug"] === "string" ? { slug: c["slug"] } : {}),
        }));
      }

      return post;
    })
    .filter((p): p is HydratedPost => p !== null);
}

function hydrateProjects(raw: unknown): HydratedProject[] {
  if (!Array.isArray(raw)) return [];
  return asRecordArray(raw)
    .map((item): HydratedProject | null => {
      const title = typeof item["title"] === "string" ? item["title"] : "";
      const slug = typeof item["slug"] === "string" ? item["slug"] : "";
      if (!title && !slug) return null;

      const project: HydratedProject = {
        title,
        slug,
        ...(typeof item["id"] === "string" || typeof item["id"] === "number"
          ? { id: item["id"] }
          : {}),
        ...(typeof item["excerpt"] === "string"
          ? { excerpt: item["excerpt"] }
          : {}),
        ...(typeof item["date"] === "string" ? { date: item["date"] } : {}),
        ...(typeof item["uri"] === "string" || item["uri"] === null
          ? { uri: item["uri"] as string | null }
          : {}),
        ...(typeof item["location"] === "string" || item["location"] === null
          ? { location: item["location"] as string | null }
          : {}),
      };

      const fi = item["featuredImage"];
      if (fi && typeof fi === "object") {
        const img = fi as Record<string, unknown>;
        const src =
          typeof img["src"] === "string"
            ? img["src"]
            : typeof img["sourceUrl"] === "string"
              ? img["sourceUrl"]
              : null;
        project.featuredImage = {
          src,
          alt: typeof img["alt"] === "string" ? img["alt"] : null,
          width: typeof img["width"] === "number" ? img["width"] : null,
          height: typeof img["height"] === "number" ? img["height"] : null,
        };
      } else if (fi === null) {
        project.featuredImage = null;
      }

      const brand = item["brand"];
      if (brand && typeof brand === "object") {
        const b = brand as Record<string, unknown>;
        project.brand = {
          ...(typeof b["id"] === "string" || typeof b["id"] === "number"
            ? { id: b["id"] }
            : {}),
          ...(typeof b["name"] === "string" ? { name: b["name"] } : {}),
          ...(typeof b["slug"] === "string" ? { slug: b["slug"] } : {}),
          ...(typeof b["thumbnail"] === "string" || b["thumbnail"] === null
            ? { thumbnail: b["thumbnail"] as string | null }
            : {}),
        };
      } else if (brand === null) {
        project.brand = null;
      }

      const tags = item["tags"];
      if (Array.isArray(tags)) {
        project.tags = asRecordArray(tags).map((t) => ({
          ...(typeof t["id"] === "string" || typeof t["id"] === "number"
            ? { id: t["id"] }
            : {}),
          ...(typeof t["name"] === "string" ? { name: t["name"] } : {}),
          ...(typeof t["slug"] === "string" ? { slug: t["slug"] } : {}),
          ...(typeof t["count"] === "number" ? { count: t["count"] } : {}),
        }));
      }

      return project;
    })
    .filter((p): p is HydratedProject => p !== null);
}

/**
 * Parse rendered WordPress HTML into EditorBlock[] and attach products/attrs
 * from the parallel rawEditorBlocks array. Also returns leftover HTML and
 * ordered segments for document-order rendering.
 */
export function processHomepageContent(
  html: string,
  rawEditorBlocks: RawEditorBlock[],
): ProcessedHomepageContent {
  if (!html) return { blocks: [], leftoverHtml: "", segments: [] };

  const result: ProcessedEditorBlock[] = [];
  const segments: HomepageSegment[] = [];
  const leftoverParts: string[] = [];
  const sections = extractHeadkitSections(html);
  let cursor = 0;
  const usedRaw = new Set<number>();

  sections.forEach((sec, index) => {
    const before = trimLeftoverChunk(html.slice(cursor, sec.start));
    if (before.length > 0) {
      leftoverParts.push(before);
      segments.push({ kind: "html", html: before });
    }

    const classList = sec.classAttr.split(/\s+/).filter(Boolean);
    const section =
      classList.find((c) => c.startsWith("section-")) ?? "section-1";

    const raw = pickRawEditorBlock(rawEditorBlocks, classList, index, usedRaw);
    const queryType =
      raw?.queryType ??
      (typeof raw?.attrs?.["queryType"] === "string"
        ? raw.attrs["queryType"]
        : undefined);

    const attrs: Record<string, unknown> = {
      ...(raw?.attrs ?? {}),
    };
    if (queryType) {
      attrs["queryType"] = queryType;
    }

    const categories = hydrateCategories(attrs["categories"]);
    const brands = hydrateBrands(attrs["brands"]);
    const posts = hydratePosts(attrs["posts"]);
    const projects = hydrateProjects(attrs["projects"]);
    const buttons = extractButtons(sec.innerHtml);
    const primaryButton = buttons[0] ?? extractButton(sec.innerHtml);

    const block: ProcessedEditorBlock = {
      name: "",
      cssClasses: classList,
      section,
      title: extractTitle(sec.innerHtml),
      description: extractDescription(sec.innerHtml, classList),
      button: primaryButton,
      products: (raw?.products ?? []) as Product[],
      attrs,
      html: sec.fullMatch,
      ...(categories.length > 0 ? { categories } : {}),
      ...(brands.length > 0 ? { brands } : {}),
      ...(posts.length > 0 ? { posts } : {}),
      ...(projects.length > 0 ? { projects } : {}),
      ...(buttons.length > 0 ? { buttons } : {}),
    };

    result.push(block);
    segments.push({ kind: "block", block });
    cursor = sec.end;
  });

  const trailing = trimLeftoverChunk(html.slice(cursor));
  if (trailing.length > 0) {
    leftoverParts.push(trailing);
    segments.push({ kind: "html", html: trailing });
  }

  return {
    blocks: result,
    leftoverHtml: leftoverParts.join("\n").trim(),
    segments,
  };
}

/**
 * Parse rendered WordPress HTML into EditorBlock[] and attach products from
 * the parallel rawEditorBlocks array.
 */
export function processEditorBlocks(
  html: string,
  rawEditorBlocks: RawEditorBlock[],
): ProcessedEditorBlock[] {
  return processHomepageContent(html, rawEditorBlocks).blocks;
}

/**
 * True when a processed block was hydrated from a WP queryType carousel
 * (product-new / product-on-sale / best-sellers / featured-categories / etc.).
 */
export function getBlockQueryType(
  block: ProcessedEditorBlock | EditorBlock,
): string | null {
  const attrs = block.attrs as Record<string, unknown> | null | undefined;
  const qt = attrs?.["queryType"];
  return typeof qt === "string" && qt.length > 0 ? qt : null;
}

/**
 * True when any processed block includes the given CSS class
 * (e.g. headkit-category-carousel → skip hardcoded Shop by Category).
 */
export function hasEditorSectionClass(
  blocks: Array<Pick<ProcessedEditorBlock, "cssClasses">>,
  className: string,
): boolean {
  return blocks.some((b) => b.cssClasses.includes(className));
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

  // Fallback for callout / legacy hilight: collect paragraphs from the first column
  if (
    classList.includes("headkit-hilight") ||
    classList.includes("headkit-callout")
  ) {
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

  // Video feature: first column heading + paragraphs (no headkit-block-* classes)
  if (classList.includes("headkit-video-feature") && !description) {
    const colM = html.match(
      /<div\s+class="wp-block-column[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    if (colM?.[1]) {
      const pRe = /<p(?:\s+[^>]*)?>([\s\S]*?)<\/p>/gi;
      let pm: RegExpExecArray | null;
      while ((pm = pRe.exec(colM[1])) !== null) {
        const text = pm[1];
        if (text !== undefined && text.trim())
          description += `<p>${text.trim()}</p>`;
      }
    }
  }

  return description;
}

function extractButton(html: string): ContentButton | null {
  const all = extractButtons(html);
  return all[0] ?? null;
}

/** Collect every headkit-block-button CTA in document order. */
function extractButtons(html: string): ContentButton[] {
  const buttons: ContentButton[] = [];
  const re =
    /<div[^>]*class="[^"]*headkit-block-button[^"]*"[^>]*>[\s\S]*?<a([^>]*)>([^<]*)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const text = decodeEntities((m[2] ?? "").trim());
    const hrefM = attrs.match(/href="([^"]*)"/i);
    const targetM = attrs.match(/target="([^"]*)"/i);
    const url = decodeEntities(hrefM?.[1] ?? "");
    if (!url && !text) continue;
    buttons.push({
      url,
      linkTarget: targetM?.[1] ?? "",
      text,
    });
  }
  return buttons;
}

/**
 * Pick the best matching hydrated editorBlocks entry for an HTML section.
 * Prefers queryType ↔ cssClass alignment so index drift does not drop carousels.
 */
function pickRawEditorBlock(
  rawEditorBlocks: RawEditorBlock[],
  classList: string[],
  index: number,
  used: Set<number>,
): RawEditorBlock | undefined {
  const expectedQt = expectedQueryTypeForClasses(classList);
  if (expectedQt) {
    for (let i = 0; i < rawEditorBlocks.length; i++) {
      if (used.has(i)) continue;
      const raw = rawEditorBlocks[i];
      if (!raw) continue;
      const qt =
        raw.queryType ??
        (typeof raw.attrs?.["queryType"] === "string"
          ? raw.attrs["queryType"]
          : null);
      if (qt === expectedQt) {
        used.add(i);
        return raw;
      }
    }
  }

  if (!used.has(index) && rawEditorBlocks[index]) {
    used.add(index);
    return rawEditorBlocks[index];
  }

  return undefined;
}

function expectedQueryTypeForClasses(classList: string[]): string | null {
  if (classList.includes("headkit-hero-carousel")) return "hero-carousel";
  if (classList.includes("headkit-project-carousel")) return "projects";
  if (classList.includes("headkit-post-carousel")) return "latest-posts";
  if (classList.includes("headkit-category-carousel"))
    return "featured-categories";
  if (classList.includes("headkit-brand-carousel")) return "featured-brands";
  if (classList.includes("headkit-product-carousel")) return "product-carousel";
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
