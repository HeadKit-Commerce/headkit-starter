import { GravityForm } from "@/components/gravity-form-lazy";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import {
  extractGravityFormIds,
  hasGravityFormMarker,
  removeGravityFormMarkers,
} from "@/lib/gravity-form-content";

interface Props {
  /** Page title shown as the H1. */
  title: string;
  /** Untrusted WordPress `content.rendered` HTML (may include GF markers). */
  html: string;
  /**
   * Optional fallback when a marker's form cannot load (e.g. GF plugin off).
   * Applied to every form on the page.
   */
  formFallback?: React.ReactNode;
}

/**
 * CMS page body with optional Gravity Forms 2-column layout.
 *
 * When the WordPress page embeds a Gravity Form (theme emits a
 * `.headkit-gravity-form` marker), render a standard two-column layout:
 * editorial copy on the left, React GravityForm(s) on the right. Without a
 * form marker, render title + EditorialContent as a normal single column.
 */
export async function CmsPageBody({
  title,
  html,
  formFallback,
}: Props): Promise<React.JSX.Element> {
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
            <GravityForm key={formId} formId={formId} fallback={formFallback} />
          ) : (
            <GravityForm key={formId} formId={formId} />
          ),
        )}
      </div>
    </div>
  );
}
