/**
 * A deterministic synthetic storefront, used to prove the harness itself.
 *
 * WHY A FAKE STORE AND NOT A REAL ONE. The two acceptance gates are "two runs
 * against an unchanged target produce an empty diff" and "a planted
 * signal-only change is caught and named". The second cannot be run against a
 * customer storefront at all — planting a change there is a deploy — and the
 * first is worth far more when it can be re-run by anyone, in CI, in seconds,
 * with no Docker stack and no network. So the gates run here, and a real
 * rehearsal host is swept separately to prove the same properties survive a
 * real Next application.
 *
 * The pages deliberately exercise every signal the harness records: a redirect
 * that is a genuine 308, a redirect that is a 200 carrying a client-side
 * navigation (the two must never read alike), a self-canonical page, JSON-LD
 * with nested `offers.url`, internal links, a robots meta tag, a robots.txt
 * with a real Disallow, a sitemap that lists some pages and not others, a
 * content block that only exists when JavaScript runs, and one genuinely
 * volatile element that exists to prove masking works.
 *
 *   bun run e2e/port-verify/testserver/server.ts --port 4599 --variant a
 */

import { createServer } from "node:http";
import type { Server } from "node:http";

/**
 * `b` differs from `a` in exactly one respect: the nested product page
 * cross-canonicals to the flat URL instead of to itself. Nothing else changes,
 * and nothing about it is visible in a screenshot.
 */
export type Variant = "a" | "b";

const FLAT_PRODUCT = "/products/copper-kettle";
const NESTED_PRODUCT = "/shop/kitchen/kettles/copper-kettle";

/** Requests served so far — the source of the one genuinely volatile element. */
let hits = 0;

/**
 * Non-GET requests that reached the server.
 *
 * MUST STAY ZERO for the lifetime of every capture. `/order-attempt` below is a
 * page that tries to POST the moment it loads; if this counter ever moves, the
 * GET-only guard did not hold and the harness is not safe to point at a store
 * whose Stripe is live.
 */
let mutations = 0;

function layout(
  origin: string,
  path: string,
  title: string,
  canonical: string,
  robots: string,
  body: string,
  jsonLd: unknown[],
  linkCanonical: string = canonical,
): string {
  const ld = jsonLd
    .map(
      (n) => `<script type="application/ld+json">${JSON.stringify(n)}</script>`,
    )
    .join("");
  hits += 1;
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="canonical" href="${origin}${linkCanonical}">
<meta property="og:url" content="${origin}${canonical}">
<meta name="robots" content="${robots}">
<style>
  :root { color-scheme: light }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0; background: #fff; color: #111 }
  header { background: #101820; color: #fff; padding: 20px 32px }
  nav a { color: #fff; margin-right: 18px; text-decoration: none }
  main { padding: 32px; max-width: 900px }
  h1 { font-size: 34px; margin: 0 0 16px }
  .card { border: 1px solid #ddd; padding: 20px; margin: 0 0 16px }
  footer { padding: 24px 32px; background: #f4f4f4; margin-top: 40px }
  /* Fixed width on purpose: a mask hides an element's CONTENT, never the
     layout shift its content causes. A volatile element that also resizes
     needs the storefront to give it a stable box; this one models that. */
  .volatile { font-variant-numeric: tabular-nums; background: #ffe9a8; padding: 6px 10px;
              display: inline-block; width: 150px; overflow: hidden; white-space: nowrap }
</style>
${ld}
</head>
<body>
<header><nav>
  <a href="/">Home</a>
  <a href="/shop">Shop</a>
  <a href="/collections/kitchen">Kitchen</a>
  <a href="/collections/kitchen/kettles">Kettles</a>
  <a href="${NESTED_PRODUCT}">Copper Kettle</a>
  <a href="/checkout">Checkout</a>
</nav></header>
<main>
${body}
<p class="card">Serving <code>${path}</code>. This paragraph exists so the page has stable
rendered text with JavaScript switched off, which is what the no-JavaScript pass measures.</p>
<p><span class="volatile" data-port-verify-mask>request #${hits}</span></p>
<div id="js-only"></div>
</main>
<footer>
  <a href="/legal/privacy">Privacy</a> ·
  <a href="/legal/terms">Terms</a> ·
  <a href="https://example.org/off-site">An off-site link</a>
</footer>
<script>
  var el = document.getElementById('js-only');
  el.className = 'card';
  el.textContent = 'This block is written by client-side JavaScript. With scripting disabled it is empty, which is what makes the no-JavaScript ink ratio lower than the JavaScript-on one.';
</script>
</body>
</html>`;
}

function productJsonLd(origin: string, canonical: string): unknown[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${origin}${canonical}#product`,
      name: "Copper Kettle",
      url: `${origin}${canonical}`,
      offers: {
        "@type": "Offer",
        url: `${origin}${canonical}`,
        priceCurrency: "AUD",
        price: "129.00",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: { "@id": `${origin}/`, name: "Home" },
        },
        {
          "@type": "ListItem",
          position: 2,
          item: { "@id": `${origin}/collections/kitchen`, name: "Kitchen" },
        },
        {
          "@type": "ListItem",
          position: 3,
          item: { "@id": `${origin}${canonical}`, name: "Copper Kettle" },
        },
      ],
    },
  ];
}

const ROBOTS_TXT = `User-agent: *
Disallow: /checkout
Disallow: /cart
Allow: /

Sitemap: {ORIGIN}/sitemap.xml
`;

const SITEMAP_PATHS = [
  "/",
  "/shop",
  "/collections/kitchen",
  "/collections/kitchen/kettles",
  NESTED_PRODUCT,
  "/legal/privacy",
  "/legal/terms",
];

/**
 * Start the synthetic storefront. Resolves once it is accepting connections.
 *
 * The returned `setVariant` changes what the RUNNING instance serves, without
 * restarting it. That is what lets the planted-change gate plant its change the
 * way a real port does: one host, two points in time. Restarting on a fresh
 * ephemeral port would instead hand the comparison two different origins, which
 * is a different kind of comparison entirely and not the one that gate tests.
 */
export function startServer(
  variant: Variant,
  port = 0,
): Promise<{
  url: string;
  close: () => Promise<void>;
  server: Server;
  setVariant: (next: Variant) => void;
}> {
  // The counter starts from zero on every instance, so the one deliberately
  // volatile element on these pages is a function of this instance's traffic
  // and nothing earlier in the process. It is belt-and-braces rather than the
  // control: the plan's `request #\d+` normalise rule is what actually keeps
  // the counter out of the prerendered-text metrics, and the mask keeps it out
  // of the pixels.
  resetHits();
  let current = variant;
  const server = createServer((req, res) => {
    const host = req.headers.host ?? "localhost";
    const origin = `http://${host}`;
    const url = new URL(req.url ?? "/", origin);
    const path = url.pathname;

    const send = (
      status: number,
      body: string,
      type = "text/html; charset=utf-8",
    ): void => {
      res.writeHead(status, {
        "content-type": type,
        "cache-control": "public, max-age=0, must-revalidate",
        "x-nextjs-prerender": "1",
      });
      res.end(body);
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      // Nothing here accepts a mutation, and the harness cannot reach this
      // branch: its browser refuses every non-GET before it leaves the process.
      // Counted rather than merely rejected, so the gate can assert zero.
      mutations += 1;
      send(405, "method not allowed", "text/plain; charset=utf-8");
      return;
    }

    if (path === "/__stats") {
      send(200, JSON.stringify({ mutations }), "application/json");
      return;
    }

    if (path === "/order-attempt") {
      // A page that tries to place an order the moment it loads. It carries a
      // real POST form AND fires a POST from script. The harness must capture
      // it as a page and let neither through.
      send(
        200,
        layout(
          origin,
          path,
          "Order attempt",
          path,
          "noindex, nofollow",
          `<h1>Order attempt</h1>
<form id="pay" method="post" action="/api/place-order"><button type="submit">Pay now</button></form>
<script>fetch('/api/place-order', { method: 'POST', body: '{}' }).catch(function () {});</script>`,
          [],
        ),
      );
      return;
    }

    if (path === "/streamed") {
      /**
       * A page whose content arrives the way a Cache Components storefront's
       * does, so the settle path is proved rather than asserted.
       *
       * The document ships a PENDING Suspense boundary — the
       * `<!--$?--><template id="B:9">` placeholder React emits — alongside the
       * `<div hidden id="S:9">` staging container it relocates content out of.
       * A script lands the hole and clears both.
       *
       * THE PAYLOAD SITS IN THE TEMPLATE, NOT IN THE HIDDEN DIV, and that is
       * the whole design of this fixture. A `<div hidden>` IS in the document
       * tree, so `document.querySelectorAll("a[href]")` finds its links whether
       * or not the hole ever landed — an assertion against it is satisfied at
       * t=0 and proves nothing, which is the same vacuous-truth trap `AGENTS.md`
       * names for the `[hidden]` half of the settled condition. Template
       * content is not in the tree, so the link below exists in the captured
       * record if and only if the harness waited. The relocation is deliberately deferred
       * well past `load`, past both network-idle waits and past the scroll
       * pass — a page that has gone completely quiet and STILL has not landed
       * its hole, which is exactly the window the harness used to photograph:
       * the content exists, but in a container that measures 0px. The delay is
       * generous on purpose, so that what the gate proves is "the harness
       * waited for the hole" rather than "the harness happened to be slow".
       *
       * GATE 1 cannot catch that on its own — both runs would miss the content
       * equally and diff to nothing, which is a false green, so `gate.ts`
       * asserts the landed content POSITIVELY as part of GATE 1.
       */
      send(
        200,
        layout(
          origin,
          path,
          "Streamed",
          path,
          "index, follow",
          `<h1>Streamed</h1>
<div id="hole"><!--$?--><template id="B:9"><p class="card">This paragraph arrived in a streamed dynamic hole.
<a href="/streamed-landed">A link that does not exist until the hole has landed.</a></p></template><!--/$--></div>
<div hidden id="S:9"><span>Staged content React would relocate.</span></div>
<script>
  setTimeout(function () {
    var tpl = document.getElementById('B:9');
    var hole = document.getElementById('hole');
    var staged = document.getElementById('S:9');
    if (tpl && hole) hole.appendChild(tpl.content.cloneNode(true));
    if (tpl) tpl.remove();
    if (staged) staged.remove();
  }, 4000);
</script>`,
          [],
        ),
      );
      return;
    }

    if (path === "/robots.txt") {
      send(
        200,
        ROBOTS_TXT.replace("{ORIGIN}", origin),
        "text/plain; charset=utf-8",
      );
      return;
    }
    if (path === "/sitemap.xml") {
      const locs = SITEMAP_PATHS.map(
        (p) => `  <url><loc>${origin}${p}</loc></url>`,
      ).join("\n");
      send(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs}\n</urlset>\n`,
        "application/xml",
      );
      return;
    }

    if (path === FLAT_PRODUCT) {
      // A real 308. Its counterpart below is a 200 carrying a client-side
      // navigation; the harness must never let the two read alike.
      res.writeHead(308, {
        location: NESTED_PRODUCT,
        "content-type": "text/html; charset=utf-8",
      });
      res.end("");
      return;
    }
    if (path === "/legacy/kettle") {
      send(
        200,
        `<!doctype html><html lang="en-AU"><head><title>Redirecting</title>` +
          `<link rel="canonical" href="${origin}/legacy/kettle"><meta name="robots" content="noindex">` +
          `</head><body><p>Redirecting…</p>` +
          `<script>window.location.replace(${JSON.stringify(NESTED_PRODUCT)});</script></body></html>`,
      );
      return;
    }

    if (path === NESTED_PRODUCT) {
      // The whole difference between the two variants: variant `b` points the
      // `<link rel="canonical">` at the flat URL and changes nothing else — not
      // og:url, not the JSON-LD, not one pixel. That is the planted
      // signal-only change the second acceptance gate requires the harness to
      // catch and to name as a canonical flip rather than as "something moved".
      const linkCanonical = current === "b" ? FLAT_PRODUCT : NESTED_PRODUCT;
      send(
        200,
        layout(
          origin,
          path,
          "Copper Kettle",
          NESTED_PRODUCT,
          "index, follow",
          `<h1>Copper Kettle</h1><p class="card">A two-litre stovetop kettle.</p>`,
          productJsonLd(origin, NESTED_PRODUCT),
          linkCanonical,
        ),
      );
      return;
    }

    const pages: Record<
      string,
      { title: string; robots: string; heading: string }
    > = {
      "/": {
        title: "Home",
        robots: "index, follow",
        heading: "Everything for the kitchen",
      },
      "/shop": { title: "Shop", robots: "index, follow", heading: "Shop" },
      "/collections/kitchen": {
        title: "Kitchen",
        robots: "index, follow",
        heading: "Kitchen",
      },
      "/collections/kitchen/kettles": {
        title: "Kettles",
        robots: "index, follow",
        heading: "Kettles",
      },
      "/legal/privacy": {
        title: "Privacy",
        robots: "index, follow",
        heading: "Privacy",
      },
      "/legal/terms": {
        title: "Terms",
        robots: "index, follow",
        heading: "Terms",
      },
      "/checkout": {
        title: "Checkout",
        robots: "noindex, nofollow",
        heading: "Checkout",
      },
    };
    const page = pages[path];
    if (page !== undefined) {
      send(
        200,
        layout(
          origin,
          path,
          page.title,
          path,
          page.robots,
          `<h1>${page.heading}</h1>`,
          [
            {
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: `${origin}${path}`,
            },
          ],
        ),
      );
      return;
    }

    send(
      404,
      layout(
        origin,
        path,
        "Not found",
        path,
        "noindex, nofollow",
        `<h1>Page not found</h1>`,
        [],
      ),
    );
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const bound =
        typeof address === "object" && address !== null ? address.port : port;
      resolve({
        url: `http://127.0.0.1:${bound}`,
        server,
        setVariant: (next: Variant): void => {
          current = next;
        },
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Reset the volatile counter, so a run's masked element starts from a known point. */
function resetHits(): void {
  hits = 0;
}

const isDirectRun = process.argv[1]?.endsWith("server.ts") === true;
if (isDirectRun) {
  const argv = process.argv.slice(2);
  const at = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const variant = (at("variant") ?? "a") as Variant;
  const started = await startServer(variant, Number(at("port") ?? "4599"));
  process.stdout.write(
    `port-verify testserver (variant ${variant}) on ${started.url}\n`,
  );
}
