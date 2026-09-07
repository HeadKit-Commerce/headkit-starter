/**
 * YouTube helpers for the PDP video tile.
 *
 * WooCommerce's "Product Video" meta box stores whatever URL the merchant
 * pasted — `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, with or without
 * extra query parameters — so the id is parsed rather than the URL trusted.
 * Anything that is not a YouTube URL with an 11-character id yields `null`,
 * and the caller renders no tile: an unparseable value must not become a
 * broken iframe on a shopper's screen.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

/** The 11-character YouTube video id in `url`, or `null` when there is none. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (parsed.hostname.toLowerCase() === "youtu.be") {
    candidate = segments[0] ?? null;
  } else if (segments[0] === "watch") {
    candidate = parsed.searchParams.get("v");
  } else if (
    segments[0] === "embed" ||
    segments[0] === "shorts" ||
    segments[0] === "v" ||
    segments[0] === "live"
  ) {
    candidate = segments[1] ?? null;
  }

  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/**
 * Poster frame for the gallery tile. `hqdefault` exists for every video;
 * `maxresdefault` is missing for many uploads and 404s to a grey placeholder.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Privacy-enhanced embed: `youtube-nocookie.com` sets no tracking cookie until
 * the shopper presses play. `rel=0` keeps end-screen suggestions to the same
 * channel.
 */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}
