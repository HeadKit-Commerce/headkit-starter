import { afterEach, describe, expect, it } from "vitest";
import {
  HOSTED_CHECKOUT_COOKIE,
  HOSTED_CHECKOUT_PENDING_KEY,
  clearHostedCheckoutPending,
  hostedCheckoutCookieOptions,
  isHostedCheckoutPending,
  markHostedCheckoutPending,
  shouldClearHostedCheckoutPending,
} from "./hosted-cart-sync";

const store = new Map<string, string>();

function installBrowserStubs(cookie = ""): void {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  let cookieJar = cookie;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return cookieJar;
      },
      set cookie(value: string) {
        const [pair] = value.split(";");
        const [name, raw] = (pair ?? "").split("=");
        if (!name) {
          return;
        }
        if (value.includes("max-age=0")) {
          cookieJar = cookieJar
            .split(";")
            .map((part) => part.trim())
            .filter((part) => !part.startsWith(`${name}=`))
            .join("; ");
          return;
        }
        const next = `${name}=${raw ?? ""}`;
        const others = cookieJar
          .split(";")
          .map((part) => part.trim())
          .filter((part) => part && !part.startsWith(`${name}=`));
        cookieJar = [...others, next].join("; ");
      },
    },
  });
}

afterEach(() => {
  store.clear();
  clearHostedCheckoutPending();
});

describe("hosted-cart-sync", () => {
  it("sets and reads the pending flag from sessionStorage", () => {
    installBrowserStubs();
    expect(isHostedCheckoutPending()).toBe(false);
    markHostedCheckoutPending();
    expect(store.get(HOSTED_CHECKOUT_PENDING_KEY)).toBe("1");
    expect(isHostedCheckoutPending()).toBe(true);
    clearHostedCheckoutPending();
    expect(isHostedCheckoutPending()).toBe(false);
  });

  it("clears pending only after an empty cart is returned", () => {
    expect(shouldClearHostedCheckoutPending(null)).toBe(false);
    expect(shouldClearHostedCheckoutPending({ itemsCount: 2 })).toBe(false);
    expect(shouldClearHostedCheckoutPending({ itemsCount: 0 })).toBe(true);
  });

  it("names the server cookie used by /checkout redirect", () => {
    const opts = hostedCheckoutCookieOptions();
    expect(opts.name).toBe(HOSTED_CHECKOUT_COOKIE);
    expect(opts.httpOnly).toBe(false);
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it("treats the cookie as pending after sessionStorage is gone", () => {
    installBrowserStubs(`${HOSTED_CHECKOUT_COOKIE}=1`);
    expect(store.get(HOSTED_CHECKOUT_PENDING_KEY)).toBeUndefined();
    expect(isHostedCheckoutPending()).toBe(true);
  });
});
