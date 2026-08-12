import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import {
  hasEditorSectionClass,
  processHomepageContent,
  type RawEditorBlock,
} from "@/lib/process-editor-blocks";

interface Props {
  /** Page title shown as the H1. */
  title: string;
  /** Untrusted WordPress `content.rendered` HTML (may include GF markers). */
  html: string;
  /**
   * Optional hydrated HeadKit section blocks from `/content/page/{slug}`
   * (hero carousel, project carousel, callouts, etc.). When present, sections
   * render via BlockEditor in document order — same path as the homepage.
   */
  editorBlocks?: RawEditorBlock[] | null | undefined;
  /**
   * Optional fallback when a marker's form cannot load (e.g. GF plugin off).
   * Applied to every form on the page.
   */
  formFallback?: React.ReactNode;
}

/** Matches homepage HTML segment padding (`app/page.tsx` HomeContent). */
const CONTENT_PAD = "headkit-cms-page hk-section-content px-5 md:px-10 py-10";

function HtmlSegment({
  html,
  formFallback,
  showTitle,
  title,
}: {
  html: string;
  formFallback?: React.ReactNode;
  showTitle: boolean;
  title: string;
}): React.JSX.Element | null {
  if (!html.trim() && !showTitle) return null;

  return (
    <div className={showTitle ? undefined : "mt-5"}>
      {showTitle ? <h1 className="text-primary">{title}</h1> : null}
      {html.trim() ? (
        <div className={showTitle ? "mt-5" : undefined}>
          <EditorialContent html={html} formFallback={formFallback} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * CMS page body with Gravity Forms hydrated in place and HeadKit section
 * patterns (carousels/callouts).
 *
 * Gravity Form markers stay where WordPress placed them — including inside
 * Columns blocks — so Contact and similar pages use the editor's 2-column
 * layout rather than a React grid. EditorialContent swaps each marker for
 * the React form (see `formFallback` when GF cannot load).
 *
 * When `editorBlocks` include HeadKit sections (hero/project carousels, etc.),
 * those hydrate via BlockEditor in WordPress document order — full-bleed like
 * the homepage (no outer page padding). HTML leftovers keep homepage padding
 * and the standard 45rem / 68rem / full measures.
 *
 * A `headkit-hero-carousel` replaces the page title H1 (carousel slide already
 * renders an H1) so CMS pages like /hospitality do not double up.
 */
export async function CmsPageBody({
  title,
  html,
  editorBlocks,
  formFallback,
}: Props): Promise<React.JSX.Element> {
  const rawBlocks = editorBlocks ?? [];
  const { segments, blocks } = processHomepageContent(html, rawBlocks);
  const suppressPageTitle = hasEditorSectionClass(
    blocks,
    "headkit-hero-carousel",
  );

  // No HeadKit section patterns — title + editorial (GF markers in place).
  if (blocks.length === 0) {
    return (
      <div className={CONTENT_PAD}>
        <h1 className="text-primary">{title}</h1>
        <div className="mt-5">
          <EditorialContent html={html} formFallback={formFallback} />
        </div>
      </div>
    );
  }

  // Document-order: HeadKit blocks (full-bleed) + leftover HTML (padded).
  let titleShown = false;
  return (
    <>
      {segments.map((seg, index) => {
        if (seg.kind === "block") {
          return (
            <BlockEditor key={`cms-block-${index}`} blocks={[seg.block]} />
          );
        }

        const showTitle = !suppressPageTitle && !titleShown;
        if (showTitle) titleShown = true;
        if (!seg.html.trim() && !showTitle) return null;
        return (
          <section key={`cms-html-${index}`} className={CONTENT_PAD}>
            <HtmlSegment
              html={seg.html}
              formFallback={formFallback}
              showTitle={showTitle}
              title={title}
            />
          </section>
        );
      })}
      {!suppressPageTitle && !titleShown ? (
        <section className={CONTENT_PAD}>
          <h1 className="text-primary">{title}</h1>
        </section>
      ) : null}
    </>
  );
}
