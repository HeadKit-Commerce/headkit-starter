import Image from "next/image";
import { Logo } from "@/components/icon/logo";

/** Nav logo box — fixed height reserves CLS space before the asset paints. */
const LOGO_HEIGHT = 36;
/** Max intrinsic width; `object-contain` keeps aspect within this box. */
const LOGO_MAX_WIDTH = 220;

/**
 * Site logo for the nav bar (ENG-572).
 *
 * Renders the per-store branding logo when a URL is configured, falling back to
 * the built-in HeadKit `<Logo/>` when it is null (no branding set, or the
 * branding fetch degraded). Height-constrained to match the default logo mark
 * (36px ≈ `h-9`) with a reserved max width so wide logos and square icons both
 * slot in without layout shift.
 *
 * Uses `next/image` so logos go through the optimizer (WebP/AVIF). Branding
 * assets are served from `storage.googleapis.com`, which is allowlisted in
 * `next.config.ts` remotePatterns.
 */
export function BrandLogo({
  logoUrl,
  siteName,
}: {
  logoUrl: string | null;
  siteName: string;
}): React.ReactNode {
  if (!logoUrl) return <Logo />;

  return (
    <Image
      src={logoUrl}
      alt={siteName}
      width={LOGO_MAX_WIDTH}
      height={LOGO_HEIGHT}
      priority
      sizes={`${LOGO_MAX_WIDTH}px`}
      className="h-9 w-auto max-w-[220px] object-contain"
    />
  );
}
