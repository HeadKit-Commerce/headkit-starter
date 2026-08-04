import { ChevronRightIcon } from "@/components/icon";
import { InstantLink } from "@/components/headkit-ui/instant-link";

interface BreadcrumbItem {
  name: string;
  uri: string;
  current?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * PDP / general breadcrumbs. InstantLink on ancestors so Shop + category
 * crumbs prefetch under Partial Prefetching (Next.js 16.3 Instant Navigation).
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-gray-800 break-words">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex max-w-full items-center gap-1">
              {i > 0 && (
                <ChevronRightIcon
                  className="h-3.5 w-3.5 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
              )}
              {isLast || item.current ? (
                <span className="font-medium text-gray-900" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <InstantLink
                  href={item.uri}
                  pendingVariant="text"
                  className="cursor-pointer transition-colors hover:text-primary"
                >
                  {item.name}
                </InstantLink>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
