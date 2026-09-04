import { cn } from "@/lib/utils";
import type { CustomProductBadge } from "@/lib/product-badges";

interface Props {
  isSale?: boolean;
  isNewIn?: boolean;
  badges?: CustomProductBadge[];
  className?: string;
}

const badgeClass =
  "inline-flex h-6 w-fit shrink-0 items-center whitespace-nowrap rounded-brand px-2 text-center font-semibold uppercase";

const BadgeList = ({ isSale, isNewIn, badges = [], className }: Props) => {
  const extras = badges.filter((badge) => {
    const key = badge.label.toLowerCase();
    if (isNewIn && key === "new") return false;
    if (isSale && key === "sale") return false;
    return true;
  });

  if (!isSale && !isNewIn && extras.length === 0) return null;

  return (
    <div
      className={cn("flex flex-row flex-wrap items-center gap-1", className)}
    >
      {isNewIn && (
        <span
          className={`headkit-badge-new ${badgeClass} bg-lime-400 text-primary`}
        >
          New
        </span>
      )}
      {isSale && (
        <span
          className={`headkit-badge-sale ${badgeClass} bg-pink-600 text-white`}
        >
          Sale
        </span>
      )}
      {extras.map((badge) => (
        <span
          key={badge.slug}
          className={`headkit-badge-custom ${badgeClass} bg-primary text-on-primary`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
};

export { BadgeList };
