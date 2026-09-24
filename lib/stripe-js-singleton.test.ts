import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const loadStripeMock = vi.fn() as ReturnType<typeof vi.fn> & {
  setLoadParameters: ReturnType<typeof vi.fn>;
};
loadStripeMock.setLoadParameters = vi.fn();

// The module under test imports `loadStripe` from `/pure`, NOT the root entry.
// That is the whole point of it — the root entry injects the Stripe.js script on
// module import, so a product page's IntersectionObserver gate can never fire in
// time. Mocking `/pure` is therefore also a real check: a revert to the root
// entry leaves this mock unapplied and the call assertions below fail.
vi.mock("@stripe/stripe-js/pure", () => ({
  loadStripe: Object.assign((...args: unknown[]) => loadStripeMock(...args), {
    setLoadParameters: (...a: unknown[]) =>
      loadStripeMock.setLoadParameters(...a),
  }),
}));

const hoisted = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return hoisted.env;
  },
}));

describe("getStripePromise", () => {
  beforeEach(() => {
    hoisted.env = {};
    loadStripeMock.setLoadParameters.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
    loadStripeMock.mockReset();
  });

  it("returns the same promise for repeated calls with the same key and account", async () => {
    const resolved = Promise.resolve({} as never);
    loadStripeMock.mockReturnValue(resolved);

    const { getStripePromise } = await import("./stripe-js-singleton");

    const first = getStripePromise("pk_test_abc", {
      stripeAccount: "acct_123",
    });
    const second = getStripePromise("pk_test_abc", {
      stripeAccount: "acct_123",
    });

    expect(first).toBe(second);
    expect(loadStripeMock).toHaveBeenCalledTimes(1);
    expect(loadStripeMock).toHaveBeenCalledWith("pk_test_abc", {
      stripeAccount: "acct_123",
    });
  });

  it("creates separate promises for different Connect accounts", async () => {
    loadStripeMock
      .mockReturnValueOnce(Promise.resolve({ id: "a" } as never))
      .mockReturnValueOnce(Promise.resolve({ id: "b" } as never));

    const { getStripePromise } = await import("./stripe-js-singleton");

    const platform = getStripePromise("pk_test_abc");
    const connected = getStripePromise("pk_test_abc", {
      stripeAccount: "acct_other",
    });

    expect(platform).not.toBe(connected);
    expect(loadStripeMock).toHaveBeenCalledTimes(2);
  });

  it("leaves Stripe's advanced fraud signals alone by default", async () => {
    // The platform default. `setLoadParameters` is not called at all, so
    // Stripe's own default (signals ON) stands — the behaviour every store has
    // today, and the one this port must not change.
    loadStripeMock.mockReturnValue(Promise.resolve({} as never));

    const { getStripePromise } = await import("./stripe-js-singleton");

    getStripePromise("pk_test_abc");
    expect(loadStripeMock).toHaveBeenCalledTimes(1);
    expect(loadStripeMock.setLoadParameters).not.toHaveBeenCalled();
  });

  it('treats an explicit "true" the same as unset', async () => {
    hoisted.env.NEXT_PUBLIC_STRIPE_ADVANCED_FRAUD_SIGNALS = "true";
    loadStripeMock.mockReturnValue(Promise.resolve({} as never));

    const { getStripePromise } = await import("./stripe-js-singleton");

    getStripePromise("pk_test_abc");
    expect(loadStripeMock.setLoadParameters).not.toHaveBeenCalled();
  });

  it('disables advanced fraud signals BEFORE the first loadStripe when a store sets "false"', async () => {
    hoisted.env.NEXT_PUBLIC_STRIPE_ADVANCED_FRAUD_SIGNALS = "false";
    loadStripeMock.mockReturnValue(Promise.resolve({} as never));

    const { getStripePromise } = await import("./stripe-js-singleton");

    // Ordering is the claim, not merely the call: `setLoadParameters` throws
    // "You cannot change load parameters after calling loadStripe" once
    // `loadStripe` has run (`@stripe/stripe-js/src/pure.ts`), so applying it
    // after the first load would be a runtime error rather than a silent no-op.
    // Nothing has been applied before the first call…
    expect(loadStripeMock.setLoadParameters).not.toHaveBeenCalled();

    getStripePromise("pk_test_abc");

    // …and the first call applies it, then loads.
    expect(loadStripeMock.setLoadParameters).toHaveBeenCalledTimes(1);
    expect(loadStripeMock.setLoadParameters).toHaveBeenCalledWith({
      advancedFraudSignals: false,
    });
    expect(loadStripeMock).toHaveBeenCalledTimes(1);
    const setOrder =
      loadStripeMock.setLoadParameters.mock.invocationCallOrder[0] ?? 0;
    const loadOrder = loadStripeMock.mock.invocationCallOrder[0] ?? 0;
    expect(setOrder).toBeLessThan(loadOrder);

    // Applied once per module instance, never again on a later key.
    getStripePromise("pk_test_other");
    expect(loadStripeMock.setLoadParameters).toHaveBeenCalledTimes(1);
  });
});

/**
 * No module may import `@stripe/stripe-js`'s ROOT entry at value level.
 *
 * The root entry injects `https://js.stripe.com/<train>/stripe.js` as a side
 * effect of import, so a single value-level import anywhere in the client graph
 * puts Stripe.js on every route that reaches it — and, because `injectScript`
 * only runs when no matching tag exists and whichever entry gets there first
 * decides the query string, it would also silently discard a store's
 * `setLoadParameters({advancedFraudSignals: false})` for the whole document.
 *
 * `import type { … } from "@stripe/stripe-js"` is fine and is used widely
 * (`lib/stripe-appearance.ts`, `components/checkout/*`): a type import is erased
 * and carries no side effect. `@stripe/react-stripe-js` is also fine — it holds
 * `@stripe/stripe-js` as a peer dependency and imports only `react` and
 * `prop-types` at runtime (verified against `dist/*.mjs` in 6.10.0).
 *
 * WHAT THIS CANNOT SEE: it reads SOURCE TEXT under four roots. It cannot observe
 * a chunk, a byte count, whether a script tag reached the DOM, or a third-party
 * package that imports the root entry itself. Whether Stripe.js is actually
 * requested on a given route is an HTTP/browser measurement, not something this
 * file asserts.
 */
const ROOT = path.join(__dirname, "..");
const SOURCE_ROOTS = ["app", "components", "lib", "hooks"] as const;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      // Tests are never bundled, so a `vi.mock` of either entry in a spec is not
      // a client-graph import — including them would make this file fail on its
      // own mock above.
      out.push(full);
    }
  }
  return out;
}

const FILES = SOURCE_ROOTS.flatMap((r) => sourceFiles(path.join(ROOT, r)));

/** An `import …` from the root entry that is NOT `import type`. */
const VALUE_IMPORT_OF_ROOT_ENTRY =
  /^\s*import\s+(?!type\s)[^;]*?from\s+["']@stripe\/stripe-js["']/m;

describe("Stripe.js is loaded through the /pure entry only", () => {
  it("finds source files to check", () => {
    // Without this the sweep below is green on an empty list.
    expect(FILES.length).toBeGreaterThan(100);
    expect(
      FILES.filter((f) =>
        /from "@stripe\/stripe-js\/pure"/.test(readFileSync(f, "utf8")),
      ).map((f) => path.relative(ROOT, f)),
      "Nothing imports the /pure entry, so this guard is proving nothing.",
    ).toEqual(["lib/stripe-js-singleton.ts"]);
  });

  it("no file imports the root entry at value level", () => {
    const offenders = FILES.filter((f) =>
      VALUE_IMPORT_OF_ROOT_ENTRY.test(readFileSync(f, "utf8")),
    ).map((f) => path.relative(ROOT, f));

    expect(
      offenders,
      `These files import @stripe/stripe-js's root entry at value level. That ` +
        `entry injects the Stripe.js <script> on module import, which both ` +
        `defeats the product page's IntersectionObserver gate and discards a ` +
        `store's setLoadParameters({advancedFraudSignals:false}) for the whole ` +
        `document. Import from "@stripe/stripe-js/pure" via ` +
        `lib/stripe-js-singleton.ts, or use \`import type\` if you only need ` +
        `types.`,
    ).toEqual([]);
  });
});
