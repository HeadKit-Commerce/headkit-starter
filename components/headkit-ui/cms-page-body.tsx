import { GravityForm } from "@/components/gravity-form-lazy";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import {
  extractGravityFormIds,
  hasGravityFormMarker,
  removeGravityFormMarkers,
} from "@/lib/gravity-form-content";
import {
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

function GravityFormColumn({
  html,
  formFallback,
}: {
  html: string;
  formFallback?: React.ReactNode;
}): React.JSX.Element | null {
  if (!hasGravityFormMarker(html)) return null;
  const formIds = extractGravityFormIds(html);
  return (
    <div className="space-y-8">
      {formIds.map((formId) =>
        formFallback ? (
          <GravityForm key={formId} formId={formId} fallback={formFallback} />
        ) : (
          <GravityForm key={formId} formId={formId} />
        ),
      )}
    </div>
  );
}

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
  if (!html.trim()) return null;

  if (!hasGravityFormMarker(html)) {
    return (
      <div className={showTitle ? undefined : "mt-5"}>
        {showTitle ? (
          <h1 className="font-extrabold text-3xl text-primary">{title}</h1>
        ) : null}
        <div className={showTitle ? "mt-5" : undefined}>
          <EditorialContent html={html} />
        </div>
      </div>
    );
  }

  const copyHtml = removeGravityFormMarkers(html);
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div>
        {showTitle ? (
          <h1 className="mb-6 font-extrabold text-3xl text-primary">{title}</h1>
        ) : null}
        {copyHtml ? <EditorialContent html={copyHtml} /> : null}
      </div>
      <GravityFormColumn html={html} formFallback={formFallback} />
    </div>
  );
}

/**
 * CMS page body with optional Gravity Forms 2-column layout and HeadKit
 * section patterns (carousels/callouts).
 *
 * When the WordPress page embeds a Gravity Form (theme emits a
 * `.headkit-gravity-form` marker), render a standard two-column layout:
 * editorial copy on the left, React GravityForm(s) on the right. Without a
 * form marker, render title + EditorialContent as a normal single column.
 *
 * When `editorBlocks` include HeadKit sections (hero/project carousels, etc.),
 * those hydrate via BlockEditor in WordPress document order.
 */
export async function CmsPageBody({
  title,
  html,
  editorBlocks,
  formFallback,
}: Props): Promise<React.JSX.Element> {
  const rawBlocks = editorBlocks ?? [];
  const { segments, blocks } = processHomepageContent(html, rawBlocks);

  // No HeadKit section patterns — keep the simple title + GF / editorial path.
  if (blocks.length === 0) {
    if (!hasGravityFormMarker(html)) {
      return (
        <>
          <h1 className="font-extrabold text-3xl text-primary">{title}</h1>
          <div className="mt-5">
            <EditorialContent html={html} />
          </div>
        </>
      );
    }

    const formIds = extractGravityFormIds(html);
    const copyHtml = removeGravityFormMarkers(html);

    return (
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h1 className="mb-6 font-extrabold text-3xl text-primary">{title}</h1>
          {copyHtml ? <EditorialContent html={copyHtml} /> : null}
        </div>
        <div className="space-y-8">
          {formIds.map((formId) =>
            formFallback ? (
              <GravityForm
                key={formId}
                formId={formId}
                fallback={formFallback}
              />
            ) : (
              <GravityForm key={formId} formId={formId} />
            ),
          )}
        </div>
      </div>
    );
  }

  // Document-order: HeadKit blocks + leftover HTML (GF markers supported).
  let titleShown = false;
  return (
    <>
      {segments.map((seg, index) => {
        if (seg.kind === "block") {
          return (
            <BlockEditor key={`cms-block-${index}`} blocks={[seg.block]} />
          );
        }

        const showTitle = !titleShown;
        titleShown = true;
        return (
          <HtmlSegment
            key={`cms-html-${index}`}
            html={seg.html}
            formFallback={formFallback}
            showTitle={showTitle}
            title={title}
          />
        );
      })}
      {!titleShown ? (
        <h1 className="font-extrabold text-3xl text-primary">{title}</h1>
      ) : null}
    </>
  );
}
