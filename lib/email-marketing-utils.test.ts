import { describe, expect, it } from "vitest";
import {
  extractEmailFromFormValues,
  hasMarketingOptIn,
  isMarketingOptInLabel,
} from "./email-marketing-utils";
import { snakeCase } from "./gravity-form-utils";

describe("isMarketingOptInLabel", () => {
  it("matches common marketing labels", () => {
    expect(isMarketingOptInLabel("Subscribe to newsletter")).toBe(true);
    expect(isMarketingOptInLabel("Email me with offers")).toBe(true);
    expect(isMarketingOptInLabel("Join our mailing list")).toBe(true);
    expect(isMarketingOptInLabel("Marketing opt-in")).toBe(true);
  });

  it("rejects unrelated checkboxes", () => {
    expect(isMarketingOptInLabel("I agree to the terms")).toBe(false);
    expect(isMarketingOptInLabel("Ship to a different address")).toBe(false);
  });
});

describe("extractEmailFromFormValues", () => {
  it("prefers email-keyed fields", () => {
    expect(
      extractEmailFromFormValues({
        email: "a@example.com",
        name: "Ada",
      }),
    ).toBe("a@example.com");
  });

  it("falls back to any email-shaped value", () => {
    expect(
      extractEmailFromFormValues({
        your_address: "b@example.com",
      }),
    ).toBe("b@example.com");
  });
});

describe("hasMarketingOptIn", () => {
  it("is true when a marketing checkbox is checked", () => {
    const fields = [
      { type: "checkbox", label: "Subscribe to newsletter" },
      { type: "email", label: "Email" },
    ];
    expect(
      hasMarketingOptIn(
        fields,
        { subscribe_to_newsletter: "true", email: "a@example.com" },
        snakeCase,
      ),
    ).toBe(true);
  });

  it("is false when unchecked", () => {
    const fields = [{ type: "checkbox", label: "Subscribe to newsletter" }];
    expect(
      hasMarketingOptIn(
        fields,
        { subscribe_to_newsletter: "false" },
        snakeCase,
      ),
    ).toBe(false);
  });
});
