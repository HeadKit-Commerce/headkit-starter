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
        <span className="outline rounded-[6px] uppercase font-semibold text-center px-2 py-1 bg-lime-400 outline-lime-400/50 text-primary ">
          New
        </span>
      )}
      {isSale && (
        <span className="outline rounded-[6px] uppercase font-semibold text-center px-2 py-1 bg-pink-600 outline-pink-600/50 text-white">
          Sale
        </span>
      )}
    </div>
  );
};

export { BadgeList };
