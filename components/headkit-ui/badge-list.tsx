import { cn } from "@/lib/utils";
import type { CustomProductBadge } from "@/lib/product-badges";

interface Props {
  isSale?: boolean;
  isNewIn?: boolean;
  badges?: CustomProductBadge[];
  className?: string;
}

const BadgeList = ({ isSale, isNewIn, badges = [], className }: Props) => {
  const extras = badges.filter((badge) => {
    const key = badge.label.toLowerCase();
    if (isNewIn && key === "new") return false;
    if (isSale && key === "sale") return false;
    return true;
  });

  if (!isSale && !isNewIn && extras.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {isNewIn && (
        <span className="headkit-badge-new rounded-brand uppercase font-semibold text-center px-2 py-1 bg-lime-400 text-primary">
          New
        </span>
      )}
      {isSale && (
        <span className="headkit-badge-sale rounded-brand uppercase font-semibold text-center px-2 py-1 bg-pink-600 text-white">
          Sale
        </span>
      )}
      {extras.map((badge) => (
        <span
          key={badge.slug}
          className="headkit-badge-custom rounded-brand uppercase font-semibold text-center px-2 py-1 bg-primary text-on-primary"
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
};

export { BadgeList };
