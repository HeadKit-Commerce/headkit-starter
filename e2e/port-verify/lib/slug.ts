/**
 * Filename stems for a URL path.
 *
 * Shared by the capture (screenshot names) and the comparison (diff-image
 * names) so the two cannot disagree, and hashed because sanitising a path to
 * filename-safe characters collides: `/a/b` and `/a_b` reduce to the same stem
 * and one diff image would silently overwrite the other.
 */

/** Stable, collision-resistant filename stem for a URL path. */
export function slugFor(path: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const stem =
    path
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 60) || "root";
  return `${stem}__${hash.toString(16).padStart(8, "0")}`;
}
