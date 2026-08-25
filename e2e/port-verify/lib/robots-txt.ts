/**
 * A robots.txt parser and path evaluator.
 *
 * The harness records a robots.txt VERDICT per captured path, not merely the
 * file's bytes, because that is the signal a port can regress: `app/robots.ts`
 * short-circuits the whole file to `disallowEverything()` on a non-indexable
 * host, so two stores can serve byte-identical robots.txt for entirely
 * different reasons and one path's verdict can flip while the file's length
 * does not change at all.
 *
 * Matching follows the de-facto standard used by the major crawlers: the
 * most-specific (longest) matching rule wins, `*` is a wildcard, a trailing `$`
 * anchors the end, and Allow beats Disallow on an equal-length tie.
 */

import type { RobotsVerdict } from "./types";

interface Rule {
  readonly kind: "allow" | "disallow";
  readonly pattern: string;
  readonly line: string;
}

interface Group {
  readonly agents: readonly string[];
  readonly rules: readonly Rule[];
}

/** Parsed robots.txt. An empty `groups` means "no rules" — everything allowed. */
export interface RobotsTxt {
  readonly groups: readonly Group[];
  readonly sitemaps: readonly string[];
}

/** The verdict for a file that could not be fetched: crawlers assume allowed. */
export const ROBOTS_ABSENT: RobotsTxt = { groups: [], sitemaps: [] };

/** Parse robots.txt source into agent groups plus any `Sitemap:` lines. */
export function parseRobotsTxt(source: string): RobotsTxt {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let rules: Rule[] = [];
  let readingAgents = false;

  const flush = (): void => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      // A second User-agent line directly after another starts a shared group;
      // one after a rule starts a new group.
      if (!readingAgents) flush();
      readingAgents = true;
      agents.push(value.toLowerCase());
      continue;
    }
    readingAgents = false;
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field === "allow" || field === "disallow") {
      rules.push({ kind: field, pattern: value, line: `${line}` });
    }
  }
  flush();
  return { groups, sitemaps };
}

/** Whether a robots pattern matches a path. `*` is any run, `$` anchors. */
export function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  let re = "";
  for (const ch of body) {
    re += ch === "*" ? ".*" : ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}${anchored ? "$" : ""}`).test(path);
}

/**
 * The specificity of a rule for a path: the length of its literal prefix. The
 * longest match wins, which is what makes `Disallow: /` lose to
 * `Allow: /shop/` rather than the file order deciding it.
 */
function specificity(pattern: string): number {
  return pattern.replace(/\$$/, "").length;
}

/** Evaluate one path for one user-agent. */
export function robotsVerdict(
  robots: RobotsTxt,
  path: string,
  userAgent = "*",
): RobotsVerdict {
  const ua = userAgent.toLowerCase();
  const exact = robots.groups.filter((g) => g.agents.includes(ua));
  const star = robots.groups.filter((g) => g.agents.includes("*"));
  const chosen = exact.length > 0 ? exact : star;
  const matchedAgent = exact.length > 0 ? ua : star.length > 0 ? "*" : ua;

  let best: Rule | null = null;
  let bestScore = -1;
  for (const group of chosen) {
    for (const rule of group.rules) {
      if (!patternMatches(rule.pattern, path)) continue;
      const score = specificity(rule.pattern);
      // Allow wins an equal-length tie, per the crawler convention.
      if (score > bestScore || (score === bestScore && rule.kind === "allow")) {
        best = rule;
        bestScore = score;
      }
    }
  }
  if (best === null) {
    return { allowed: true, rule: null, userAgent: matchedAgent };
  }
  return {
    allowed: best.kind === "allow",
    rule: best.line,
    userAgent: matchedAgent,
  };
}
