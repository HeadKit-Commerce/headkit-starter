import { describe, expect, it } from "vitest";

import {
  parseCgroupMemoryLimit,
  resolveBuildWorkers,
} from "@/lib/build-parallelism";

const GB = 1024 * 1024 * 1024;

describe("resolveBuildWorkers", () => {
  it("keeps one worker on Vercel's standard 4-core/8 GB build machine", () => {
    // The measured OOM case. One worker is today's behaviour, so this default
    // cannot make an existing storefront build worse.
    expect(resolveBuildWorkers({ totalMemBytes: 8 * GB, cpus: 4 })).toBe(1);
  });

  it("gives two workers on an 8-core/16 GB enhanced machine", () => {
    expect(resolveBuildWorkers({ totalMemBytes: 16 * GB, cpus: 8 })).toBe(2);
  });

  it("is bounded by cores, not only by memory", () => {
    expect(resolveBuildWorkers({ totalMemBytes: 64 * GB, cpus: 2 })).toBe(2);
  });

  it("never exceeds the default cap however large the machine", () => {
    expect(resolveBuildWorkers({ totalMemBytes: 256 * GB, cpus: 64 })).toBe(4);
  });

  it("trusts the smaller of the cgroup limit and os.totalmem()", () => {
    // A container that reports the host's 64 GB but is capped at 8 GB must not
    // fork the host's worth of workers.
    expect(
      resolveBuildWorkers({
        totalMemBytes: 64 * GB,
        cgroupLimitBytes: 8 * GB,
        cpus: 16,
      }),
    ).toBe(1);
  });

  it("falls back to one worker when no reading is usable", () => {
    expect(resolveBuildWorkers({ totalMemBytes: 0, cpus: 0 })).toBe(1);
    expect(resolveBuildWorkers({ totalMemBytes: Number.NaN, cpus: 8 })).toBe(1);
  });
});

describe("parseCgroupMemoryLimit", () => {
  it("reads a byte count", () => {
    expect(parseCgroupMemoryLimit("17179869184")).toBe(16 * GB);
  });

  it("treats the cgroup v2 'max' sentinel as no limit", () => {
    expect(parseCgroupMemoryLimit("max\n")).toBeUndefined();
  });

  it("treats the cgroup v1 unlimited sentinel as no limit", () => {
    // 9223372036854771712 is what an unconstrained v1 cgroup reports.
    expect(parseCgroupMemoryLimit("9223372036854771712")).toBeUndefined();
  });

  it("ignores absent, empty and non-numeric contents", () => {
    expect(parseCgroupMemoryLimit(undefined)).toBeUndefined();
    expect(parseCgroupMemoryLimit("")).toBeUndefined();
    expect(parseCgroupMemoryLimit("not-a-number")).toBeUndefined();
    expect(parseCgroupMemoryLimit("-1")).toBeUndefined();
  });
});
