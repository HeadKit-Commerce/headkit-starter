import Link from "next/link";
import { ChevronRightIcon } from "@/components/icon";

interface BreadcrumbItem {
  name: string;
  uri: string;
  current?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

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
                <Link
                  href={item.uri}
                  className="cursor-pointer transition-colors hover:text-primary"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
