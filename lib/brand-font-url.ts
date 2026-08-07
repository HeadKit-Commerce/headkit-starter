/**
 * Same-origin URLs for dashboard-uploaded brand fonts.
 *
 * Uploads live on `storage.googleapis.com/headkit-storage/branding/…`. That
 * bucket does not send `Access-Control-Allow-Origin`, so Chrome (and Firefox)
 * refuse to apply the face for cross-origin `@font-face` while Safari often
 * still paints it. Rewrite to `/api/branding-font` so the font is same-origin.
 */

const GCS_HOST = "storage.googleapis.com";
const BRANDING_PREFIX = "/headkit-storage/branding/";
const FONT_FILE_RE = /^[A-Za-z0-9._-]+\.(woff2|woff|ttf|otf)$/i;

/**
 * True when `fileName` is a safe branding font object name (no path segments).
 */
export function isSafeBrandingFontFileName(fileName: string): boolean {
  return FONT_FILE_RE.test(fileName);
}

/**
 * Public GCS object URL for a branding font file name, or null if unsafe.
 */
export function brandingFontGcsUrl(
  fileName: string,
  version?: string,
): string | null {
  if (!isSafeBrandingFontFileName(fileName)) return null;
  const base = `https://${GCS_HOST}${BRANDING_PREFIX}${fileName}`;
  if (!version) return base;
  const u = new URL(base);
  u.searchParams.set("v", version);
  return u.toString();
}

/**
 * Rewrite a dashboard `fileUrl` to a same-origin proxy path when it points at
 * HeadKit branding storage. Non-matching URLs are returned unchanged.
 */
export function toSameOriginBrandFontUrl(fileUrl: string): string {
  const trimmed = fileUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const u = new URL(trimmed);
    if (u.hostname !== GCS_HOST) return trimmed;
    if (!u.pathname.startsWith(BRANDING_PREFIX)) return trimmed;

    const fileName = u.pathname.slice(BRANDING_PREFIX.length);
    if (!isSafeBrandingFontFileName(fileName)) return trimmed;

    const params = new URLSearchParams();
    params.set("f", fileName);
    const version = u.searchParams.get("v");
    if (version) params.set("v", version);
    return `/api/branding-font?${params.toString()}`;
  } catch {
    return trimmed;
  }
}
