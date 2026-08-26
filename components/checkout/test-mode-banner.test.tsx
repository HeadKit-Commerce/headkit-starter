import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutTestModeBanner } from "./test-mode-banner";

describe("CheckoutTestModeBanner", () => {
  it("renders nothing on a live-key session", () => {
    expect(
      CheckoutTestModeBanner({
        testMode: false,
        publishableKey: "pk_live_abc",
      }),
    ).toBeNull();
    expect(
      renderToStaticMarkup(
        <CheckoutTestModeBanner
          testMode={false}
          publishableKey="pk_live_abc"
        />,
      ),
    ).toBe("");
  });

  it("never shows test cards when the publishable key is live", () => {
    expect(
      CheckoutTestModeBanner({
        testMode: true,
        publishableKey: "pk_live_abc",
      }),
    ).toBeNull();
  });

  it("renders the Test mode bar and Test cards trigger in test mode", () => {
    const html = renderToStaticMarkup(
      <CheckoutTestModeBanner testMode={true} publishableKey="pk_test_abc" />,
    );
    expect(html).toContain("checkout-test-mode-banner");
    expect(html).toContain("Test mode");
    expect(html).toContain("Test cards");
  });

  it("renders nothing without a Stripe session", () => {
    expect(
      CheckoutTestModeBanner({ testMode: false, publishableKey: "" }),
    ).toBe(null);
  });
});
