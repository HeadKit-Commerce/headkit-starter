/**
 * How many Next build workers a storefront prerender may use.
 *
 * `next build` forks one worker per `experimental.cpus` and each worker holds
 * its own module graph plus the pages it has rendered, so the worker count is
 * multiplied against the build container's MEMORY, not its cores. Measured on
 * the Bike Society rehearsal storefront (14,615 prerendered pages), same commit,
 * same catalogue, four Vercel builds:
 *
 * | machine        | workers | outcome                                        |
 * | -------------- | ------- | ---------------------------------------------- |
 * | 4 core / 8 GB  | 1       | 13,116 pages at the 45-min ceiling, no OOM     |
 * | 4 core / 8 GB  | 4       | wedged at 9,235; 60s per-page prerender timeouts|
 * | 4 core / 8 GB  | 2       | 12,769 pages in 14.5 min, then container OOM    |
 * | 8 core / 16 GB | 2       | 14,448 pages in 32.8 min, no OOM                |
 *
 * Two readings follow, and both are encoded here:
 *
 *  - Throughput is not the scarce resource. Two workers tripled it (~290 →
 *    ~930 pages/min); the run still died, of memory.
 *  - The ceiling is roughly 8 GB of container memory per worker for a catalogue
 *    of this size. Under it, workers do not thrash and page renders stay fast;
 *    over it the failure is not graceful — 4 workers on 8 GB spent 39 minutes
 *    making no progress at all, which reads as a hang rather than as OOM.
 *
 * So workers are derived from MEMORY and merely bounded by cores. A standard
 * 8 GB build machine keeps today's single worker (this function cannot make an
 * existing build worse); a 16 GB machine gets two. `NEXT_BUILD_CPUS` overrides
 * in both directions and is the right lever for a store whose provider or
 * catalogue is known to differ.
 */

/** Container memory a single build worker is assumed to need. */
export const BYTES_PER_BUILD_WORKER = 8 * 1024 * 1024 * 1024;

/** Never fork more than this by default, whatever the machine reports. */
export const MAX_DEFAULT_BUILD_WORKERS = 4;

/** Machine readings `resolveBuildWorkers` derives a worker count from. */
export interface BuildMachine {
  /** `os.totalmem()`. */
  readonly totalMemBytes: number;
  /**
   * The cgroup memory limit, when one is readable. Containers commonly report
   * the HOST's memory via `os.totalmem()`, so the smaller of the two readings
   * is the one to trust. `undefined` when there is no limit to read (or it is
   * the "unlimited" sentinel).
   */
  readonly cgroupLimitBytes?: number | undefined;
  /** `os.availableParallelism()` — respects the container's CPU affinity. */
  readonly cpus: number;
}

/**
 * Resolve the default build worker count for a machine.
 *
 * Always returns at least 1, so an unreadable or nonsensical machine reading
 * degrades to the serialized build rather than to a guess.
 */
export function resolveBuildWorkers(machine: BuildMachine): number {
  const readings = [machine.totalMemBytes, machine.cgroupLimitBytes].filter(
    (value): value is number => Number.isFinite(value) && (value ?? 0) > 0,
  );
  if (readings.length === 0) return 1;
  const memBytes = Math.min(...readings);

  const byMemory = Math.floor(memBytes / BYTES_PER_BUILD_WORKER);
  const byCpu = Number.isFinite(machine.cpus) ? Math.floor(machine.cpus) : 1;

  return Math.max(1, Math.min(byMemory, byCpu, MAX_DEFAULT_BUILD_WORKERS));
}

/**
 * Parse a cgroup memory-limit file's contents.
 *
 * cgroup v2 (`memory.max`) writes the literal `max` when unlimited; v1
 * (`memory.limit_in_bytes`) writes a near-`Number.MAX_SAFE_INTEGER` sentinel.
 * Both mean "no limit", and both must come back `undefined` rather than as a
 * memory reading — treating the v1 sentinel as real memory would license the
 * maximum worker count on every machine.
 */
export function parseCgroupMemoryLimit(
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (text === "" || text === "max") return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  // Anything at or above this is a "no limit" sentinel, not a machine with
  // exabytes of RAM.
  if (value >= Number.MAX_SAFE_INTEGER) return undefined;
  return value;
}
