/**
 * The one path-glob dialect the plan files use.
 *
 * Deliberately tiny: `*` matches within a segment, `**` crosses `/`. Nothing
 * else. A plan that needs more expressive matching is a plan that has started
 * encoding store knowledge into the harness, which is what the fixture files
 * are for.
 */

/** Compile a path glob to an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
      continue;
    }
    out += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** Whether `path` matches any glob in `globs`. An empty list matches nothing. */
export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}
