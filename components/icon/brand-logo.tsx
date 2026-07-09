import { Logo } from "@/components/icon/logo";

/**
 * Site logo for the nav bar (ENG-572).
 *
 * Renders the per-store branding logo when a URL is configured, falling back to
 * the built-in HeadKit `<Logo/>` when it is null (no branding set, or the
 * branding fetch degraded). Height-constrained to match the default logo mark
 * (36px ≈ `h-9`) with intrinsic width so wide logos and square icons both slot
 * in without distortion.
 *
 * A plain `<img>` is used (not `next/image`) because the URL is an arbitrary
 * per-tenant remote asset that is not enumerable in `next.config` remotePatterns.
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={siteName}
      className="h-9 w-auto max-w-[220px] object-contain"
    />
  );
}
