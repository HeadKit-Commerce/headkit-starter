import { describe, expect, it } from "vitest";

import { isIndexableHost } from "./host-indexing";

const PRODUCTION_URL = "https://www.dishee.com.au";

describe("isIndexableHost", () => {
  it("reports eligible when the current host matches the configured frontend url", () => {
    expect(
      isIndexableHost(PRODUCTION_URL, "www.dishee.com.au"),
      "the store's own production host must stay indexable — getting this backwards deindexes the live site",
    ).toBe(true);
  });

  it("treats the configured host with and without a leading www label as the same host", () => {
    expect(
      isIndexableHost(PRODUCTION_URL, "dishee.com.au"),
      "apex and www of the configured domain are the same site",
    ).toBe(true);
    expect(
      isIndexableHost("https://dishee.com.au", "www.dishee.com.au"),
      "www of an apex-configured domain is the same site",
    ).toBe(true);
  });

  it("reports NOT eligible for a host under the temporary hosting domain", () => {
    expect(
      isIndexableHost(PRODUCTION_URL, "dishee-rehearsal.vercel.app"),
      "the rehearsal host must never be indexable — it would publish the real catalogue against the live site",
    ).toBe(false);
  });

  it("reports NOT eligible for a preview deployment host", () => {
    expect(
      isIndexableHost(PRODUCTION_URL, "dishee-git-branch-headkit.vercel.app"),
      "preview deployments must never be indexable",
    ).toBe(false);
    expect(
      isIndexableHost(PRODUCTION_URL, "preview.dishee.com.au"),
      "a subdomain of the configured domain is a different site, not the production host",
    ).toBe(false);
  });

  it("reports NOT eligible when no frontend url is configured — an unknown host fails CLOSED", () => {
    expect(
      isIndexableHost(undefined, "www.dishee.com.au"),
      "an unconfigured store must fail closed, not open",
    ).toBe(false);
    expect(
      isIndexableHost("", "www.dishee.com.au"),
      "an empty configured url must fail closed",
    ).toBe(false);
    expect(
      isIndexableHost("not a url", "www.dishee.com.au"),
      "an unparseable configured url must fail closed",
    ).toBe(false);
    expect(
      isIndexableHost(PRODUCTION_URL, undefined),
      "a missing Host header must fail closed",
    ).toBe(false);
  });

  it("reports NOT eligible for a LOOKALIKE host that merely ends with the configured domain", () => {
    expect(
      isIndexableHost(PRODUCTION_URL, "evildishee.com.au"),
      "lookalike host: suffix matching must not be substring matching (T-15.1-08-03)",
    ).toBe(false);
    expect(
      isIndexableHost("https://dishee.com.au", "notdishee.com.au"),
      "lookalike host: `notdishee.com.au`.endsWith('dishee.com.au') is true and must NOT pass",
    ).toBe(false);
    expect(
      isIndexableHost("https://dishee.com.au", "dishee.com.au.attacker.test"),
      "lookalike host: the configured domain as a PREFIX of an attacker domain must not pass",
    ).toBe(false);
  });

  it("ignores port, case and a trailing root dot when comparing hosts", () => {
    expect(
      isIndexableHost(PRODUCTION_URL, "WWW.DISHEE.COM.AU"),
      "host comparison is case-insensitive",
    ).toBe(true);
    expect(
      isIndexableHost("https://localhost:3000", "localhost:3000"),
      "a configured host with a port still matches its own Host header",
    ).toBe(true);
    expect(
      isIndexableHost(PRODUCTION_URL, "www.dishee.com.au."),
      "a fully-qualified trailing dot is the same host",
    ).toBe(true);
  });
});
