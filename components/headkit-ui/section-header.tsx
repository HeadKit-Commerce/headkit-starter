import sanitize from "sanitize-html";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { cn, decodeHtmlEntities } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  allButton?: string;
  allButtonPath?: string;
  allButtonTarget?: string;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  allButton,
  allButtonPath,
  allButtonTarget,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 gap-x-8 gap-y-2 py-5 md:grid-cols-3",
        className,
      )}
    >
      <div className="flex items-center">
        <h2 className="text-2xl font-semibold text-primary">
          {decodeHtmlEntities(title)}
        </h2>
      </div>

      {description ? (
        <div className="flex items-center">
          <h3
            className="font-medium text-primary"
            dangerouslySetInnerHTML={{ __html: sanitize(description) }}
          />
        </div>
      ) : (
        <div />
      )}

      {allButton && (
        <div className="flex items-center justify-start font-semibold md:justify-end">
          <InstantLink
            href={allButtonPath ?? "/"}
            pendingVariant="text"
            target={allButtonTarget ?? ""}
            className="underline"
          >
            {decodeHtmlEntities(allButton)}
          </InstantLink>
        </div>
      )}
    </div>
  );
}
