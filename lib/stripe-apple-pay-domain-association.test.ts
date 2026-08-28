import { describe, expect, it } from "vitest";
import {
  resolveApplePayDomainAssociation,
  STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION,
} from "./stripe-apple-pay-domain-association";

describe("resolveApplePayDomainAssociation", () => {
  it("serves the universal Stripe association when env override is unset", () => {
    expect(resolveApplePayDomainAssociation(undefined)).toBe(
      STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION,
    );
    expect(resolveApplePayDomainAssociation("")).toBe(
      STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION,
    );
    expect(resolveApplePayDomainAssociation("   ")).toBe(
      STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION,
    );
  });

  it("honours a non-empty override", () => {
    expect(resolveApplePayDomainAssociation("custom-token")).toBe(
      "custom-token",
    );
    expect(resolveApplePayDomainAssociation("  custom-token  ")).toBe(
      "custom-token",
    );
  });
});
