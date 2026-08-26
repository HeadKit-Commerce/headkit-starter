import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * `/contact` must survive a CMS outage, at request time AND at build time.
 *
 * `getPageData` returns null ONLY for a page that genuinely does not exist and
 * PROPAGATES a transport failure — that is what stops `/[...slug]` and
 * `/wholesale` baking a sticky 404 into their route caches, and it must not be
 * softened in the shared helper.
 *
 * `/contact` is the one consumer with the opposite contract: null already means
 * "no WordPress page, use the built-in copy", and a store with no Contact page
 * still gets a working contact form. An outage is not a better reason to take
 * that away — and this route is PRERENDERED (`instant = true`), so an uncaught
 * throw fails `next build` for every store on the template. `loadContactPage`
 * is the consumer-level tolerance that closes it; these assertions are what
 * stop a plain `await getPageData(CONTACT_SLUG)` reinstating the failure while
 * the suite stays green.
 */

const contentGet = vi.fn<(slug: string, type: string) => Promise<unknown>>();

vi.mock("server-only", () => ({}));

/**
 * Only the SINK is replaced. `errorFields` runs for real, so the bounded-field
 * contract is exercised rather than stubbed.
 */
const { loggerError } = vi.hoisted(() => ({
  loggerError:
    vi.fn<(event: string, fields?: Record<string, unknown>) => void>(),
}));

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return { ...actual, logger: { ...actual.logger, error: loggerError } };
});

vi.mock("next/cache", () => ({
  cacheTag: (): void => {},
  cacheLife: (): void => {},
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    content: {
      get: (slug: string, type: string): Promise<unknown> =>
        contentGet(slug, type),
    },
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { allowIndexing: true },
      storeSettings: { domain: "shop.example" },
    }),
}));

vi.mock("@/lib/make-metadata", () => ({
  makeSeoMetadata: (): Record<string, unknown> => ({ title: "From WordPress" }),
  seoFallbackDescription: (): string => "",
  storefrontUrl: (path: string): string => `https://shop.example${path}`,
}));

vi.mock("@/components/seo/breadcrumb-json-ld", () => ({
  BreadcrumbJsonLD: (): null => null,
}));

// The real body would pull in the whole editorial/Gravity Forms tree. What this
// file is about is WHICH title/html reach it, so it is stubbed to emit them.
vi.mock("@/components/headkit-ui/cms-page-body", () => ({
  CmsPageBody: ({ title, html }: { title: string; html: string }) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  ),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown): void => {
    if (
      error instanceof Error &&
      /NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|NEXT_REDIRECT/.test(
        error.message,
      )
    ) {
      throw error;
    }
  },
}));

const outage = (): Error =>
  Object.assign(new Error("headkit.content: gateway unreachable"), {
    code: "TRANSPORT_ERROR",
  });

beforeEach(() => {
  contentGet.mockReset();
  loggerError.mockClear();
});

/**
 * `ContactRoute` is module-private, so it is reached the way the route reaches
 * it: the default export returns `<Suspense><ContactRoute /></Suspense>`, and
 * the child element carries the component itself. `renderToStaticMarkup` does
 * not resolve an async server component — it would emit the skeleton fallback —
 * so the component is awaited first and its settled tree rendered.
 */
async function renderContact(): Promise<string> {
  const { default: ContactPage } = await import("./page");
  const boundary = ContactPage() as ReactElement<{ children: ReactElement }>;
  const route = boundary.props.children;
  const Content = route.type as () => Promise<ReactElement>;
  return renderToStaticMarkup(await Content());
}

describe("a CMS outage degrades /contact instead of failing it", () => {
  it("still renders the built-in copy when the page read throws", async () => {
    contentGet.mockRejectedValue(outage());

    const html = await renderContact();

    expect(
      html,
      "an uncaught throw here fails `next build` for every store on the " +
        "template; the null branch's defaults are what it must fall back to.",
    ).toContain("Contact Us");
    expect(html).toContain("Have a question?");
  });

  it("still guarantees a contact form when the page read throws", async () => {
    contentGet.mockRejectedValue(outage());

    const html = await renderContact();

    expect(
      html,
      "`withGuaranteedFormMarker` is the reason /contact never renders " +
        "without a form; degrading must not drop it.",
    ).toContain("headkit-gravity-form");
  });

  it("logs the degrade with the slug that aims the recovery lever", async () => {
    contentGet.mockRejectedValue(outage());

    await renderContact();

    expect(
      loggerError,
      "at build the placeholder copy IS the artifact; a silent degrade makes " +
        "the build that shipped it indistinguishable from a clean one.",
    ).toHaveBeenCalled();
    const [event, fields] = loggerError.mock.calls[0]!;
    expect(event).toBe("contact.degraded_render");
    expect(
      fields?.["pageSlug"],
      "the slug is what aims `revalidateTag(TAG.page(slug))`.",
    ).toBe("contact");
    expect(fields).toMatchObject({ name: "Error", code: "TRANSPORT_ERROR" });
  });

  it("does not log when the read succeeds", async () => {
    contentGet.mockResolvedValue({
      title: "Talk To Us",
      content: "<p>Real WordPress copy.</p>",
      seo: null,
      editorBlocks: [],
    });

    await renderContact();

    expect(
      loggerError,
      "a clean read is not a degrade; logging one would drown the real signal.",
    ).not.toHaveBeenCalled();
  });

  it("prefers the WordPress copy when the read succeeds", async () => {
    contentGet.mockResolvedValue({
      title: "Talk To Us",
      content: "<p>Real WordPress copy.</p>",
      seo: null,
      editorBlocks: [],
    });

    const html = await renderContact();

    expect(
      html,
      "the tolerance must not become a blanket override — a real page still wins.",
    ).toContain("Talk To Us");
    expect(html).toContain("Real WordPress copy.");
  });

  it("re-raises Next control flow rather than swallowing it into the defaults", async () => {
    contentGet.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));

    await expect(
      renderContact(),
      "notFound()/redirect() signal by throwing; absorbing one here would " +
        "silently turn it into a 200 page of default copy.",
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK/);
  });
});

describe("generateMetadata degrades the same way", () => {
  it("falls back to the default title when the page read throws", async () => {
    contentGet.mockRejectedValue(outage());
    const { generateMetadata } = await import("./page");

    await expect(
      generateMetadata(),
      "generateMetadata runs at build for this prerendered route, so an " +
        "uncaught throw here is the deploy-blocking path.",
    ).resolves.toMatchObject({ title: "Contact Us" });
  });

  it("re-raises Next control flow", async () => {
    contentGet.mockRejectedValue(new Error("NEXT_REDIRECT;/somewhere"));
    const { generateMetadata } = await import("./page");

    await expect(generateMetadata()).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
