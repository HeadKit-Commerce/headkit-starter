import type { ReactElement, ReactNode } from "react";

/**
 * Cart drawer column: the product list scrolls, and everything passed as
 * `pinned` or `footer` stays in view.
 */
export function CartDrawerRegions({
  scroll,
  pinned,
  footer,
}: {
  scroll: ReactNode;
  pinned?: ReactNode;
  footer?: ReactNode;
}): ReactElement {
  return (
    <>
      <div
        data-cart-scroll
        className="min-h-0 flex-1 overflow-y-auto scrollbar-hide"
      >
        {scroll}
      </div>
      {pinned}
      {footer ? (
        <div data-cart-footer className="shrink-0">
          {footer}
        </div>
      ) : null}
    </>
  );
}
