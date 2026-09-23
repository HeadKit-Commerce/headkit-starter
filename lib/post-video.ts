export interface PostCategoryRef {
  slug?: string | null;
  name?: string | null;
}

export interface VideoPostRef {
  categories?: readonly PostCategoryRef[] | null;
  videoUrl?: string | null;
}

export type VideoEmbed =
  | { kind: "iframe"; src: string }
  | { kind: "file"; src: string };

/** True when the post is tagged Video (slug or name). */
export function isVideoPost(post: VideoPostRef): boolean {
  return (post.categories ?? []).some((category) => {
    const slug = (category.slug ?? "").trim().toLowerCase();
    const name = (category.name ?? "").trim().toLowerCase();
    return slug === "video" || name === "video";
  });
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] ?? null;
  }
  if (
    host !== "youtube.com" &&
    host !== "m.youtube.com" &&
    host !== "youtube-nocookie.com"
  ) {
    return null;
  }
  const fromQuery = url.searchParams.get("v");
  if (fromQuery) return fromQuery;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" || parts[0] === "shorts") {
    return parts[1] ?? null;
  }
  return null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
  return /^\d+$/.test(id) ? id : null;
}

/**
 * Player for a post video URL. Only YouTube, Vimeo, and direct mp4/webm
 * files are returned — anything else stays closed so a modal cannot embed
 * an arbitrary host.
 */
export function videoEmbed(url: string | null | undefined): VideoEmbed | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const youtube = youtubeId(parsed);
  if (youtube && /^[\w-]{6,}$/.test(youtube)) {
    return {
      kind: "iframe",
      src: `https://www.youtube.com/embed/${encodeURIComponent(youtube)}`,
    };
  }
  const vimeo = vimeoId(parsed);
  if (vimeo) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo}` };
  }
  if (/\.(mp4|webm)$/i.test(parsed.pathname)) {
    return { kind: "file", src: parsed.toString() };
  }
  return null;
}
