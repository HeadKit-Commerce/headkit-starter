/**
 * Structured JSON logger — the single approved logging boundary for the
 * storefront (D8, `RECOMMENDATION.md` §3).
 *
 * The repo lint gate flags `console.*` (`no-console`) and, until this module,
 * no logger existed (`09.5-PATTERNS.md` "No Analog Found"). Every structured
 * log now routes through here so there is ONE auditable sink instead of the
 * banned console API scattered through handlers.
 *
 * Each call emits exactly ONE line of machine-parseable JSON
 * (`{ level, event, ...fields }`) to stdout (`info`) or stderr (`error`),
 * queryable in Vercel Runtime Logs and exportable via Log Drains. The logger:
 *  - never throws (a non-serializable field bag degrades to a marker line);
 *  - never logs a value it is not explicitly handed — callers MUST NOT pass a
 *    secret / body-secret / raw error body in `fields` (threat T-09.5-07).
 *
 * Pure boundary — no `process.env`, no secret is ever a field this module adds.
 */

/** Typed field bag — `unknown` values, never `any` (repo tsconfig bans `any`). */
export type LogFields = Record<string, unknown>;

type LogLevel = "info" | "error";

/**
 * Minimal Sentry-style capture surface. `@sentry/nextjs` is not yet a
 * dependency of this app (parity with `app/error.tsx`, which only TODOs Sentry),
 * so error events forward to a globally-registered capture function WHEN one
 * exists and no-op otherwise — never a hard import of an uninstalled package.
 */
interface SentryLike {
  captureMessage: (message: string, level?: "error") => void;
}

/** Resolve a registered Sentry client from the global scope, if any. */
function getSentry(): SentryLike | undefined {
  const candidate = (globalThis as { Sentry?: unknown }).Sentry;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { captureMessage?: unknown }).captureMessage ===
      "function"
  ) {
    return candidate as SentryLike;
  }
  return undefined;
}

/** Serialize one structured line; degrade to a marker rather than throw. */
function serialize(
  level: LogLevel,
  event: string,
  fields: LogFields | undefined,
): string {
  try {
    return JSON.stringify({ level, event, ...(fields ?? {}) });
  } catch {
    return JSON.stringify({ level, event, serializationError: true });
  }
}

/** Write one newline-terminated line to the given sink, swallowing sink errors. */
function emit(sink: NodeJS.WriteStream, line: string): void {
  try {
    sink.write(`${line}\n`);
  } catch {
    // A failing stdout/stderr must never surface as an app error.
  }
}

export const logger = {
  /** Emit one structured info line to stdout. */
  info(event: string, fields?: LogFields): void {
    emit(process.stdout, serialize("info", event, fields));
  },
  /** Emit one structured error line to stderr; forward to Sentry if configured. */
  error(event: string, fields?: LogFields): void {
    emit(process.stderr, serialize("error", event, fields));
    getSentry()?.captureMessage(event, "error");
  },
} as const;
