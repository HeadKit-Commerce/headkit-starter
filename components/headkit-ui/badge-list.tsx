import { cn } from "@/lib/utils";

interface Props {
  isSale?: boolean;
  isNewIn?: boolean;
  className?: string;
}

const BadgeList = ({ isSale, isNewIn, className }: Props) => {
  if (!isSale && !isNewIn) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {isNewIn && (
        <span className="rounded-brand uppercase font-semibold text-center px-2 py-1 bg-lime-400 text-primary">
          New
        </span>
      )}
      {isSale && (
        <span className="rounded-brand uppercase font-semibold text-center px-2 py-1 bg-pink-600 text-white">
          Sale
        </span>
      )}
    </div>
  );
};

export { BadgeList };
