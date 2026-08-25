#!/usr/bin/env node
/**
 * edge-config-stub.mjs — a local stand-in for the Vercel Edge Config read API,
 * so the maintenance gate can be proven end-to-end without a Vercel project.
 *
 * `@vercel/edge-config` accepts any connection-string host (its "external"
 * connection type), so pointing the storefront at this server exercises the
 * REAL SDK, the REAL proxy and a REAL production build — only the origin is
 * local:
 *
 *   EDGE_CONFIG=http://127.0.0.1:3998/ecfg_proof?token=proof-token
 *
 * Implements exactly what the SDK uses, with the same semantics as the real
 * service, because those semantics are what the gate's sharpness depends on:
 *
 *   GET  /<id>/item/<key>?version=1   -> the value as JSON
 *                                        404 + `x-edge-config-digest` when the
 *                                        key is absent (the SDK reads that as
 *                                        `undefined`, i.e. not in maintenance)
 *                                        ETag / If-None-Match -> 304, and the
 *                                        ETag changes when the value changes
 *   PATCH /<id>/items                 -> the same body shape as Vercel's write
 *                                        API, so the flip performed in a proof
 *                                        run is the flip the runbook documents
 *
 * Usage: node scripts/smoke/edge-config-stub.mjs [port] [--fail]
 *   --fail  answer every read with 500, to exercise the fail path.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3998);
const CONFIG_ID = "ecfg_proof";
const TOKEN = "proof-token";

/** In-memory items. Mutated by PATCH; never persisted. */
const items = new Map();
let failReads = process.argv.includes("--fail");
/** Status used when failing. 500 exercises the SDK's stale-if-error layer;
 *  401 makes the SDK throw, which is what reaches the gate's own fail path. */
let failStatus = 500;

const etagOf = (value) =>
  `"${createHash("sha1")
    .update(JSON.stringify(value ?? null))
    .digest("hex")}"`;

const send = (res, status, body, headers = {}) => {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(payload);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const segments = url.pathname.split("/").filter(Boolean);
  const token =
    url.searchParams.get("token") ??
    (req.headers.authorization ?? "").replace(/^Bearer /, "");

  // Control surface for the proof driver (not part of the Edge Config API).
  if (req.method === "POST" && url.pathname === "/__fail") {
    failReads = url.searchParams.get("on") === "1";
    failStatus = Number(url.searchParams.get("status") ?? 500);
    return send(res, 200, { failReads, failStatus });
  }

  if (segments[0] !== CONFIG_ID) return send(res, 404, { error: "not_found" });
  if (token !== TOKEN) return send(res, 401, { error: "unauthorized" });

  if (req.method === "PATCH" && segments[1] === "items") {
    const body = await readBody(req);
    for (const item of body.items ?? []) {
      if (item.operation === "delete") items.delete(item.key);
      else items.set(item.key, item.value);
    }
    return send(res, 200, { status: "ok" });
  }

  if (req.method === "GET" && segments[1] === "item" && segments[2]) {
    if (failReads) return send(res, failStatus, { error: "stubbed_failure" });
    const key = decodeURIComponent(segments[2]);
    if (!items.has(key)) {
      // A missing key is NOT an error — the digest header is how the SDK tells
      // "no such key" (undefined) from "no such Edge Config" (throws).
      return send(
        res,
        404,
        { error: "key_not_found" },
        {
          "x-edge-config-digest": "stub",
        },
      );
    }
    const value = items.get(key);
    const etag = etagOf(value);
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    return send(res, 200, value, { ETag: etag });
  }

  return send(res, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `edge-config-stub listening on http://127.0.0.1:${port}/${CONFIG_ID} (token=${TOKEN})\n`,
  );
});
