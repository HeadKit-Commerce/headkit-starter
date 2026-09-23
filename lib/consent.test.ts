import { describe, expect, it } from "vitest";

import {
  CONSENT_ALL_DENIED,
  CONSENT_ALL_GRANTED,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  consentSignals,
  parseStoredConsent,
  pushConsentCommand,
  serializeConsent,
} from "@/lib/consent";

/**
 * The pure half of the consent gate: the category → Google-signal mapping, the
 * storage record's tolerance for junk, and the dataLayer command's SHAPE.
 *
 * WHERE IT STOPS. Nothing here loads a tag, reaches Google, or observes a
 * cookie. That the denied default actually prevents `test_cookie` on
 * `.doubleclick.net` is a browser measurement, made on the store fork this
 * code was ported from (`tigerheart-studios/bikesociety-v2` PR #75, whose body
 * carries the five arms and the raw cookie evidence). This suite can only
 * prove that what we push is the thing that was measured.
 */
describe("consentSignals", () => {
  it("denies all four v2 signals for a visitor who has not chosen", () => {
    expect(consentSignals(CONSENT_ALL_DENIED)).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
      // Spam and fraud protection is not a marketing purpose.
      security_storage: "granted",
    });
  });

  it("grants everything once both categories are allowed", () => {
    expect(consentSignals(CONSENT_ALL_GRANTED)).toEqual({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
      functionality_storage: "granted",
      personalization_storage: "granted",
      security_storage: "granted",
    });
  });

  it("keeps the two categories independent", () => {
    const adsOnly = consentSignals({ analytics: false, advertising: true });
    expect(adsOnly.ad_storage).toBe("granted");
    expect(adsOnly.ad_user_data).toBe("granted");
    expect(adsOnly.ad_personalization).toBe("granted");
    expect(adsOnly.analytics_storage).toBe("denied");

    const analyticsOnly = consentSignals({
      analytics: true,
      advertising: false,
    });
    expect(analyticsOnly.ad_storage).toBe("denied");
    expect(analyticsOnly.analytics_storage).toBe("granted");
  });
});

describe("parseStoredConsent", () => {
  it("round-trips a decision", () => {
    const decision = {
      version: CONSENT_VERSION,
      at: "2026-09-23T00:00:00.000Z",
      choices: { analytics: true, advertising: false },
    };
    expect(parseStoredConsent(serializeConsent(decision))).toEqual(decision);
  });

  /**
   * Every unreadable shape must mean "ask again", never an implied grant.
   * Asking twice is the benign failure.
   */
  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["not JSON", "{oops"],
    ["a JSON scalar", "42"],
    ["a JSON null", "null"],
    [
      "an older version",
      '{"version":0,"choices":{"analytics":true,"advertising":true}}',
    ],
    ["a missing category", '{"version":1,"choices":{"analytics":true}}'],
    [
      "a non-boolean category",
      '{"version":1,"choices":{"analytics":"yes","advertising":true}}',
    ],
    ["no choices at all", '{"version":1}'],
  ])("returns null for %s", (_label, raw) => {
    expect(parseStoredConsent(raw)).toBeNull();
  });
});

describe("pushConsentCommand", () => {
  /**
   * THE test in this file.
   *
   * The tag platform reads the consent API from `arguments` OBJECTS
   * specifically. `dataLayer.push(["consent","default",{…}])` is accepted
   * silently, ignored, and sets the DoubleClick cookie anyway — measured, with
   * no error and a dataLayer that reads correctly in the console. So the shape
   * is asserted before the contents, because a test that only checks the
   * contents is green under the bug.
   */
  it("pushes an arguments object, never an array", () => {
    const dataLayer: unknown[] = [];
    pushConsentCommand(
      dataLayer,
      "default",
      consentSignals(CONSENT_ALL_DENIED),
    );

    expect(dataLayer).toHaveLength(1);
    const pushed = dataLayer[0];
    expect(Array.isArray(pushed)).toBe(false);
    expect(typeof pushed).toBe("object");
    expect(pushed).not.toBeNull();
    expect(Object.prototype.toString.call(pushed)).toBe("[object Arguments]");
    expect((pushed as IArguments).length).toBe(3);
  });

  it("carries the command and the signals", () => {
    const dataLayer: unknown[] = [];
    pushConsentCommand(
      dataLayer,
      "update",
      consentSignals(CONSENT_ALL_GRANTED),
    );

    const pushed = dataLayer[0] as IArguments;
    expect(pushed[0]).toBe("consent");
    expect(pushed[1]).toBe("update");
    expect(pushed[2]).toMatchObject({
      ad_storage: "granted",
      analytics_storage: "granted",
    });
  });
});

describe("the storage key and version", () => {
  /**
   * Both are part of a shipped contract with every visitor's browser. Changing
   * the key orphans every stored decision silently — the visitor is re-asked,
   * which is benign, but a store that measured its accept rate sees it reset
   * with no other signal. Changing the VERSION is the supported way to do that
   * deliberately, and `parseStoredConsent` above already proves an older
   * version re-asks rather than being read as a grant.
   */
  it("are the values already in visitors' browsers", () => {
    expect(CONSENT_STORAGE_KEY).toBe("headkit:consent");
    expect(CONSENT_VERSION).toBe(1);
  });
});
