/**
 * The CLI argument parser both entrypoints share.
 *
 * ONE PARSER, BECAUSE TWO COPIES DRIFT. `capture.ts` and `compare.ts` each
 * carried their own copy, and each copy had the same hole: an unrecognised
 * `--key value` pair was collected and then never read. `--min-interval 2000`
 * instead of `--min-interval-ms` left the 250ms floor in place and swept a live
 * customer storefront eight times faster than the operator asked — and the
 * README is what tells operators to raise that flag against a customer host.
 * `--freeze-clock true` had the same shape from the other direction: the
 * value-bearing form landed in the value map, the boolean lookup missed it, and
 * clock pinning was silently off for a target that renders dates.
 *
 * So a flag is DECLARED here or it is an error. A flag that is silently ignored
 * is the same failure as a flag that cannot fail: the run reports success under
 * settings nobody chose.
 *
 * Every function throws a named Error rather than exiting, so the CLIs own
 * their own exit codes and the rules are unit-testable.
 */

/** Which flags a CLI accepts, and which of them take a value. */
export interface ArgSpec {
  /** Flags of the form `--name value` or `--name=value`. */
  readonly value: readonly string[];
  /** Flags of the form `--name`, with no value. */
  readonly boolean: readonly string[];
}

/** A parsed command line. */
export interface ParsedArgs {
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}

function known(spec: ArgSpec): string[] {
  return [...spec.value, ...spec.boolean].sort();
}

/**
 * Parse `--flag` / `--key value` / `--key=value`, rejecting anything undeclared
 * or mis-shaped.
 *
 * A value flag written bare and a boolean flag given a value are both errors
 * rather than silently-dropped input: each one means the operator asked for
 * something the run is not going to do.
 */
export function parseArgv(
  argv: readonly string[],
  spec: ArgSpec,
  tool: string,
): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueFlags = new Set(spec.value);
  const booleanFlags = new Set(spec.boolean);

  const reject = (name: string): never => {
    throw new Error(
      `${tool}: --${name} is not a known option. Known options: ${known(spec)
        .map((k) => `--${k}`)
        .join(", ")}.`,
    );
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      throw new Error(
        `${tool}: unexpected argument "${arg}". Every option is a --flag; this tool takes no positional arguments.`,
      );
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      const name = arg.slice(2, eq);
      if (booleanFlags.has(name)) {
        throw new Error(
          `${tool}: --${name} is a switch and takes no value (got "${arg.slice(eq + 1)}"). Pass it bare as --${name}.`,
        );
      }
      if (!valueFlags.has(name)) reject(name);
      values.set(name, arg.slice(eq + 1));
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    const bare = next === undefined || next.startsWith("--");
    if (booleanFlags.has(name)) {
      if (!bare) {
        throw new Error(
          `${tool}: --${name} is a switch and takes no value (got "${next}"). Pass it bare as --${name}.`,
        );
      }
      flags.add(name);
      continue;
    }
    if (!valueFlags.has(name)) reject(name);
    if (bare) {
      throw new Error(
        `${tool}: --${name} needs a value. Pass it as --${name} <value>.`,
      );
    }
    values.set(name, next!);
    i += 1;
  }
  return { values, flags };
}

/**
 * A numeric option, validated rather than coerced.
 *
 * Bare `Number()` turns `--concurrency abc` into NaN, and NaN does not fail —
 * it disables. `Array.from({length: NaN})` spawns zero workers, so a capture
 * writes a `capture.json` beside an empty `entries/` directory and exits 0
 * saying "complete". The same shape on `--pixel-threshold` is worse: `delta >
 * NaN` is always false, so a whole sweep reports zero screenshot differences
 * and the only trace is the words "threshold of NaN" in the report. A setting
 * that cannot fail is the false green this harness exists to prevent.
 */
export function numberOption(
  values: ReadonlyMap<string, string>,
  name: string,
  fallback: number,
  min: number,
  max: number,
  tool: string,
): number {
  const raw = values.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) {
    throw new Error(
      `${tool}: --${name} ${raw} is not a number. Refusing to run with a setting that cannot fail.`,
    );
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${tool}: --${name} ${raw} is out of range (expected a whole number ${min}-${max}).`,
    );
  }
  return value;
}
