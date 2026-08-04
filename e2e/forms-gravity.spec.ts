import { test, expect, type Page } from "@playwright/test";
import {
  BASE_URL,
  stackIsUp,
  wpCliAvailable,
  wpEval,
} from "./fixtures/helpers-2";

/**
 * Gravity Forms e2e (autonomous QA run — E2E-GAPS.md Gap 10).
 *
 * Closes UAT rows P1-38 (/contact GF form via WP page marker / form 1:
 * validation + submit +
 * ENTRY recorded), P1-23 (PDP enquiry GF form 3: hidden product-context
 * fields land on the entry — the ENG-794 id-loss regression makes the ENTRY
 * assertion the point, not the UI toast), and P1-24 (gift-card form
 * validation: invalid recipient email keeps add-to-cart disabled; the
 * "Select delivery date" radio reveals the date input).
 *
 * ENTRY ASSERTIONS: the local stack exposes no GF REST surface
 * (gf/v2 is 404 — the GF REST API setting is off), so entries are read
 * through WP-CLI/GFAPI inside the local Docker WordPress container
 * (helpers-2.wpEval — LOCAL-ONLY guarded). Seeded forms
 * (docker/wordpress/seed-gravity-forms.php):
 *   form 1 Contact          — 1 Name, 2 Email, 3 Message
 *   form 3 Product Enquiry  — 1 Name, 2 Email, 3 Message,
 *                             4 Product Name (hidden), 5 Product URL (hidden),
 *                             6 Product Size (hidden), 7 Product Colour (hidden)
 *
 * Each run submits with a UNIQUE email so entry lookups are collision-free
 * under parallel load (entries are additive — nothing is deleted).
 *
 * LOCAL-ONLY (HARD RULE): all endpoints are localhost Docker services.
 */

/** Read the newest GF entry whose Email field (id 2) equals `email`. */
function findEntryByEmail(
  formId: number,
  email: string,
): Record<string, string> | null {
  const out = wpEval(`
    if (!class_exists('GFAPI')) { echo json_encode(null); return; }
    $entries = GFAPI::get_entries(${formId}, array(
      'field_filters' => array(array('key' => '2', 'value' => ${JSON.stringify(email)})),
    ), array('key' => 'date_created', 'direction' => 'DESC'), array('offset' => 0, 'page_size' => 1));
    echo json_encode(is_wp_error($entries) || empty($entries) ? null : $entries[0]);
  `);
  const jsonLine =
    out
      .split("\n")
      .reverse()
      .find((l) => {
        const t = l.trim();
        return t.startsWith("{") || t === "null";
      }) ?? "null";
  return JSON.parse(jsonLine) as Record<string, string> | null;
}

/** Poll for the entry to land (the submit round-trips app → gateway → WP). */
async function expectEntry(
  formId: number,
  email: string,
): Promise<Record<string, string>> {
  let entry: Record<string, string> | null = null;
  await expect
    .poll(
      () => {
        entry = findEntryByEmail(formId, email);
        return entry !== null;
      },
      {
        message: `no GF entry recorded on form ${formId} for ${email} — submission did not persist (ENG-794 surface)`,
        timeout: 30_000,
      },
    )
    .toBe(true);
  return entry!;
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
}

test.describe("Gravity Forms: contact, PDP enquiry entry integrity, gift-card validation (P1-38, P1-23, P1-24)", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway :4000 + starter",
    );
    test.skip(
      !wpCliAvailable(),
      "docker exec into the local WP container unavailable — cannot assert GF entries",
    );
  });

  test("P1-38: /contact — required-field validation blocks, valid submit confirms AND records the entry", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/contact`);
    await expect(page.getByRole("heading", { name: "Contact Us" })).toBeVisible(
      { timeout: 30_000 },
    );

    // The GF form loads client-side (server action fetch of form 1).
    const sendButton = page.getByRole("button", { name: /send message/i });
    await expect(
      sendButton,
      "GF contact form did not load (form 1 unavailable via the gateway?)",
    ).toBeVisible({ timeout: 30_000 });

    // 1. Empty submit → zod validation blocks, no confirmation.
    // KNOWN COPY BUG (observed, flagged for the QA report): the empty-form
    // message renders the RAW zod internal "Invalid input: expected string,
    // received undefined" instead of "{Label} is required" — the form's
    // useForm initializes before the GF definition loads, so fields start
    // undefined and the .min(1) message never applies
    // (components/gravity-form.tsx generateValidationSchema + defaultValues).
    // The blocking CONTRACT is asserted; the copy nit is annotated.
    await sendButton.click();
    await expect(
      page.getByText(/is required|invalid input/i).first(),
      "empty submit was not blocked by validation",
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/thanks for reaching out/i)).toHaveCount(0);
    const rawZodCopy = await page
      .getByText(/invalid input: expected string/i)
      .count();
    test.info().annotations.push({
      type: "observation",
      description: `empty-submit validation copy: ${rawZodCopy > 0 ? "RAW ZOD INTERNAL message shown (cosmetic bug — gravity-form.tsx schema/defaults race)" : "friendly required-field copy"}`,
    });

    // 2. Invalid email keeps blocking.
    await fillByLabel(page, "Name", "HeadKit E2E");
    await fillByLabel(page, "Email", "not-an-email");
    await fillByLabel(page, "Message", "Autonomous QA contact-form run.");
    await sendButton.click();
    await expect(
      page.getByText("Invalid email address"),
      "email-format validation message did not render",
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/thanks for reaching out/i)).toHaveCount(0);

    // 3. Valid submit → confirmation copy + entry recorded in GF.
    const email = `e2e-contact-${Date.now()}@example.com`;
    await fillByLabel(page, "Email", email);
    await sendButton.click();
    await expect(
      page.getByText(/thanks for reaching out/i),
      "confirmation message did not render after a valid submit",
    ).toBeVisible({ timeout: 30_000 });

    const entry = await expectEntry(1, email);
    expect(entry["1"], "Name field did not land on the entry").toBe(
      "HeadKit E2E",
    );
    expect(entry["3"], "Message field did not land on the entry").toBe(
      "Autonomous QA contact-form run.",
    );
  });

  test("P1-23: PDP enquiry — hidden product-context fields land on the GF entry (ENG-794)", async ({
    page,
  }) => {
    const productPath = "/products/test-product-12";
    await page.goto(`${BASE_URL}${productPath}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Test Product 12" }),
    ).toBeVisible({ timeout: 30_000 });

    // The Enquire control renders only after the form-availability probe.
    const enquireButton = page.getByRole("button", {
      name: /enquire about this product/i,
    });
    await expect(
      enquireButton,
      "Enquire button absent — GF form 3 unavailable (product-enquiry pipeline down)",
    ).toBeVisible({ timeout: 30_000 });
    await enquireButton.click();

    const sendButton = page.getByRole("button", { name: /send enquiry/i });
    await expect(sendButton).toBeVisible({ timeout: 30_000 });

    // Hidden product fields must NOT render as inputs (they are injected).
    await expect(page.getByLabel("Product URL")).toHaveCount(0);

    const email = `e2e-enquiry-${Date.now()}@example.com`;
    await fillByLabel(page, "Name", "HeadKit Enquirer");
    await fillByLabel(page, "Email", email);
    await fillByLabel(
      page,
      "Message",
      "Does this come in a larger size? (autonomous QA)",
    );
    await sendButton.click();
    await expect(
      page.getByText(/thanks for your enquiry/i),
      "enquiry confirmation did not render",
    ).toBeVisible({ timeout: 30_000 });

    // THE ENG-794 POINT: the hidden ids resolved, so the entry carries the
    // injected product context — name (field 4) and the full PDP URL (5).
    const entry = await expectEntry(3, email);
    expect(
      entry["4"],
      "hidden Product Name did not attach to the entry (ENG-794 id-loss regression)",
    ).toBe("Test Product 12");
    expect(
      entry["5"],
      "hidden Product URL did not attach to the entry (ENG-794 id-loss regression)",
    ).toBe(`${BASE_URL}${productPath}`);
  });

  test("P1-24: gift-card form — invalid recipient email keeps add-to-cart disabled; delivery-date radio reveals the date input", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/products/headkit-gift-card`);
    const recipient = page.getByPlaceholder("Recipient Email");
    await expect(recipient, "gift-card PDP form did not render").toBeVisible({
      timeout: 30_000,
    });

    const addToCart = page.getByRole("button", { name: /^add to cart$/i });
    await expect(addToCart).toBeDisabled();

    // Invalid email + otherwise-complete form → still blocked.
    await recipient.fill("not-an-email");
    await recipient.blur();
    await page.getByPlaceholder("From Name").fill("HeadKit E2E");
    await page.getByPlaceholder("From Name").blur();
    await expect(
      page.getByText(/needs to be a correct email/i),
      "invalid-email validation message did not render",
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      addToCart,
      "add-to-cart enabled despite an invalid recipient email",
    ).toBeDisabled();

    // Delivery "Now" is the default — no date input until "Select delivery
    // date" is chosen.
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await page.getByLabel("Select delivery date").click();
    await expect(
      page.locator('input[type="date"]'),
      "choosing 'Select delivery date' did not reveal the date input",
    ).toBeVisible({ timeout: 15_000 });

    // Fixing the email completes the form → the button unblocks (the
    // captured-values gate needs a blur + async trigger round-trip).
    await recipient.fill("gift-recipient@example.com");
    await recipient.blur();
    await expect(
      addToCart,
      "valid form did not enable add-to-cart",
    ).toBeEnabled({ timeout: 15_000 });
  });
});
