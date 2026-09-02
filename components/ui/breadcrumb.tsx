import { Fragment } from "react";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { convertToRelativePath } from "@/lib/convert-uri";
import { decodeHtmlEntities } from "@/lib/utils";
import { stripTitleMarkers } from "@/lib/title-emphasis";

interface Props {
  items: {
    name: string;
    uri: string;
    current: boolean;
  }[];
}

/**
 * Collection / brand breadcrumbs. Non-current crumbs use InstantLink so
 * `/shop` and `/collections/*` get runtime Partial Prefetching + click pending
 * feedback (Next.js 16.3 Instant Navigation).
 */
const Breadcrumb = ({ items }: Props) => {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm break-words">
        {items.map((item, i) => {
          const label = stripTitleMarkers(decodeHtmlEntities(item.name));
          if (item.current) {
            return (
              <li key={i} className="max-w-full text-primary">
                {label}
              </li>
            );
          }

          const href = convertToRelativePath(item?.uri) || "";
          return (
            <Fragment key={i}>
              <li className="max-w-full shrink">
                <InstantLink
                  href={href}
                  pendingVariant="text"
                  className="cursor-pointer text-gray-800 hover:underline"
                >
                  {label}
                </InstantLink>
              </li>
              <li className="text-gray-800" aria-hidden="true">
                {">"}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

export { Breadcrumb };
