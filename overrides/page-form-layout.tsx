import type { ReactNode } from "react";

/** True when the Shopify contact/partnerships form sits beside the page copy. */
export function shopifyFormUsesSideColumn(): boolean {
  return false;
}

/**
 * Page body plus an optional Shopify form. Starter stacks the form under the
 * copy. A customer override can place them side by side.
 */
export function PageWithOptionalForm({
  body,
  form,
}: {
  body: ReactNode;
  form: ReactNode | null;
}): ReactNode {
  if (!form) {
    return body;
  }
  return (
    <>
      {body}
      <div className="px-5 pb-10 md:px-10 md:pb-16">
        <div className="mx-auto max-w-xl">{form}</div>
      </div>
    </>
  );
}
