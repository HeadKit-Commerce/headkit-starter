# Maintenance mode

One storefront goes dark — and comes back — in a single Edge Config write. No
redeploy, no build, no DNS. This is cutover gate **G6**: the moment the write
lands is the moment the sign goes up, which is what makes it usable as `T+0` /
`drain_start` in a cutover runbook.

> **Maintenance mode is a sign, not a fence.** It cannot stop checkouts — a
> shopper already at the payment provider is outside this origin entirely. The
> fence is the WooCommerce option write that disables the payment gateway
> (runbook §3.2), and the proof the drain took is that gateway disappearing from
> the Store API (§3.3). Nothing here claims otherwise.

---

## The two commands

Replace `<KEY>` with the key for the host (see [Keys](#keys) — for
`www.dishee.com.au` it is `maintenance_www_dishee_com_au`).

**Up (T+0):**

```bash
vercel global-config update ecfg_ipggupuxe0d16l0tyltx8bthbgbg --scope headkit \
  --patch '{"items":[{"operation":"upsert","key":"<KEY>","value":true}]}'
```

**Down (runbook §9 rollback, and §10 cleanup):**

```bash
vercel global-config update ecfg_ipggupuxe0d16l0tyltx8bthbgbg --scope headkit \
  --patch '{"items":[{"operation":"upsert","key":"<KEY>","value":false}]}'
```

`upsert` is deliberate: it works whether or not the key already exists, so the
lift cannot fail because someone deleted the key instead of setting it `false`.

Same thing over the REST API, if the CLI is not to hand:

```bash
curl -X PATCH "https://api.vercel.com/v1/edge-config/ecfg_ipggupuxe0d16l0tyltx8bthbgbg/items?teamId=team_GvTsoakVKxxpa3qd6xhE8aqL" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H 'Content-Type: application/json' \
  -d '{"items":[{"operation":"upsert","key":"<KEY>","value":false}]}'
```

Or in the Vercel dashboard: **HeadKit → Storage → `maintenance-gate-store` →**
edit the item. Any of the three is one action.

**Then verify it, every time — do not trust the write:**

```bash
curl -sI https://<host>/ | head -1      # HTTP/2 503  (up)  |  HTTP/2 200  (down)
```

A `503` also carries `x-hk-maintenance`, which says **why** it is dark: `flag`
(the value said so) or `fail-closed:<reason>` (the value could not be read and
this host was last seen dark — see [If the flag cannot be
read](#if-the-flag-cannot-be-read)). Worth checking during a window: a
`fail-closed` 503 means Edge Config is not answering, so the **lift** will not
be seen either until it is.

Propagation is a few seconds at most (measured locally against the real SDK read
path: a request 44 ms after the write already saw the flip). If the curl still
disagrees after ~30 s, the key name is wrong — see [Keys](#keys).

---

## What must exist

| Thing                               | Value                                                                                                                   | Who        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| Edge Config store                   | `maintenance-gate-store`, id `ecfg_ipggupuxe0d16l0tyltx8bthbgbg`, team `headkit`                                        | created ✅ |
| Store **connected to the project**  | connect `maintenance-gate-store` to the storefront's Vercel project                                                     | captain    |
| `GLOBAL_CONFIG` env var             | injected automatically by the connect step above (older projects carry `EDGE_CONFIG` instead — the gate accepts either) | Vercel     |
| One item per host                   | key + value, see below                                                                                                  | operator   |
| `MAINTENANCE_BYPASS_SECRET` env var | ≥ 16 chars, set on the project before the window                                                                        | captain    |

### The first connect — the non-production surface for gate G6

`maintenance-gate-store` is created but **connected to nothing**, so no
storefront can yet be darkened. The surface to prove it on is the starter's own
staging deploy, which builds from this repo:

- project: **`headkit-starter-staging`** (`headkit-starter-staging.vercel.app`)
- connect: Vercel → HeadKit → Storage → `maintenance-gate-store` → **Projects →
  Connect Project** → `headkit-starter-staging`. That injects **`GLOBAL_CONFIG`**;
  redeploy once so the build picks it up.
- also set `MAINTENANCE_BYPASS_SECRET` (≥ 16 chars) on that project.
- then the key to create is
  **`maintenance_headkit_starter_staging_vercel_app`** — set it `true`, curl the
  host, expect `503`; set it `false`, expect `200`.

The customer storefronts (`dishee-rehearsal`, `pebblrbooth-rehearsal`, and the
live projects) deploy from their own repos, so each needs the gate ported there
and the same store connected to it.

### Which variable holds the connection string

**`GLOBAL_CONFIG`** on anything connected today. Vercel has renamed the product
(`vercel global-config`, "Global Config store") and the injected variable
followed; `EDGE_CONFIG` is the pre-rename name and still exists on older
projects. Confirmed on `headkit-starter-staging` on 2026-08-25: `GLOBAL_CONFIG`
on Production, Preview and Development, and no `EDGE_CONFIG` at all.

The gate accepts **either**, resolving `GLOBAL_CONFIG ?? EDGE_CONFIG` once. Do
**not** "fix" an inert gate by hand-creating an `EDGE_CONFIG` variable holding a
copy of the connection string: that duplicates a read token and drifts the
moment the connection is rotated or reconnected.

If a flip does nothing, check this first:

```bash
curl -sI https://<host>/ | grep -i x-hk-maintenance
```

- no `x-hk-maintenance-key` header at all → **no store is connected** (or the
  project has not been redeployed since it was), so the gate is unarmed and no
  key of any value will darken anything;
- `x-hk-maintenance: unarmed:invalid-connection` → a connection string is
  present but unusable; reconnect the store rather than editing the variable.

Connecting the store is what **arms** the gate. Until a project has that
variable, the gate does nothing at all — it does not read, it does not
delay, and every request is served exactly as it was before. That is the state
every storefront is in today, and it is why merging this changes nothing.

`MAINTENANCE_BYPASS_SECRET` is read from the build's environment, so setting or
changing it needs a redeploy. Set it before the window. That is fine, and it is
not the thing the "no redeploy" rule is about — the **flag** is what must be
changeable at request time, and it is.

---

## Keys

The store is **team-level** and will be connected to every storefront project on
the team. A single root boolean would therefore be a fleet-wide kill switch: one
flip would darken every storefront at once, including stores that are trading
normally. So the gate reads **one key per host**, derived from the host on the
request:

> lowercase the host, drop the port, replace every character outside
> `[a-z0-9]` with `_`, and prefix `maintenance_`.

| Host                          | Key                                       |
| ----------------------------- | ----------------------------------------- |
| `www.dishee.com.au`           | `maintenance_www_dishee_com_au`           |
| `dishee.com.au`               | `maintenance_dishee_com_au`               |
| `dishee-rehearsal.vercel.app` | `maintenance_dishee_rehearsal_vercel_app` |
| `www.pebblr.com.au`           | `maintenance_www_pebblr_com_au`           |

**A host with no key is not in maintenance.** That is the normal, permanent
state of every store that is not in a window; no key needs to exist for a store
to work.

`www.` is **not** stripped, and there is deliberately **no fleet-wide key**.

### Key EVERY host that resolves to the project, not just the custom domain

This is the one way to get the flip wrong and still see a green-looking result.
A Vercel project always serves its **assigned production alias**
(`<project>.vercel.app`, and on this team usually a `*.headkit.app` alias too),
and that alias is **not** redirected to the custom domain. So a window that sets
only `maintenance_www_dishee_com_au` leaves the alias answering `200` and still
transacting, with nothing reporting it.

Before the window, list the project's hosts (Vercel → project → **Domains**, or
`vercel project inspect <project>`), and set a key for every one a request can
arrive on — custom domain, `www` and apex if both are attached, the
`*.headkit.app` alias, and the `*.vercel.app` alias. Then verify each of them:

```bash
for h in www.dishee.com.au dishee.com.au dishee-rehearsal.headkit.app <project>.vercel.app; do
  printf '%s -> ' "$h"; curl -s -o /dev/null -w '%{http_code}\n' "https://$h/"
done
```

Every host you intend to darken must read `503`. On Vercel an apex→www redirect
is served ahead of this gate, so the apex may legitimately answer `308` — follow
it and check where it lands.

To read the exact key a live host resolves to, without guessing:

```bash
curl -sI https://<host>/ | grep -i x-hk-maintenance-key
```

That header is present on every response once the Edge Config is connected. If
it is **absent**, the store is not connected yet and no key will do anything.

The store ships with one sample item Vercel created with it,
`greeting: "hello world"`. It is not ours and nothing reads it — delete it
whenever convenient.

### Value shapes

```jsonc
true                       // dark, Retry-After 3600
false                      // up
{ "enabled": true, "retryAfterSeconds": 900,
  "headline": "We're upgrading", "message": "Back around 7pm AEST." }
```

Anything unrecognised (a string, `null`, a missing `enabled`) reads as **up**: a
malformed value must not darken a store by accident. `headline` / `message` set
here override the page copy for this window only, without a deploy.

---

## What the page is

A single self-contained HTML document served with **`503`**, `Retry-After`,
`X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`. It is never
`200` — a maintenance page served as `200` is indexable content, and this
project has already had a rehearsal URL reach a search engine.

It has no stylesheet link, no font request, no script and no remote image, so it
cannot render broken on the one day it is served, and it does not touch
WordPress, dashboard-api or the gateway — the systems a cutover window is
changing.

Brand it per store in **`overrides/maintenance.ts`** (the existing customer-owned
overrides seam): title, headline, message, footer, colours, and a logo that must
be a same-origin `public/` path or a `data:` URI.

---

## Exemptions — what keeps answering while the store is dark

Enumerated from the route tree. Each is here because a `503` would break
something that outlives the window:

| Path                                                                                               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/revalidate`                                                                                  | otherwise the store cannot be refreshed while dark — exactly when content is changing                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/api/checkout/confirm` **and** `/checkout/finalising`                                             | the migration safety net for a shopper returned by their bank hours later, plus the holding page it 303s to. The handler is read-only by construction (it redirects and logs; it cannot create or mutate an order) and its one log line is the only record a stranded shopper existed; exempting it alone would send that shopper — card already charged — into the maintenance page instead of "Payment received". The holding page performs no data read of any kind and is already `noindex`, so it is safe to serve while dark |
| `/api/posts-base-path`                                                                             | `proxy.ts` fetches this from inside itself                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/api/indexnow-key` and `/{key}.txt`                                                               | search-engine ownership proof — another silent, long-tailed failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/robots.txt`                                                                                      | a 5xx robots.txt makes Googlebot treat the whole site as disallowed. On a store being migrated for its SEO that is the worst possible side effect of an afternoon offline                                                                                                                                                                                                                                                                                                                                                          |
| `/_next/`, `/_vercel/`                                                                             | framework and platform internals (asset chunks, analytics/monitoring beacons)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| every dotted static path (`/icon-default.svg`, `/sitemap.xml`, `/feed.xml`, `_next/static`)        | never reaches the gate — `proxy.ts`'s matcher already excludes them. This is also why the maintenance page may safely reference a `public/` asset                                                                                                                                                                                                                                                                                                                                                                                  |

**Deliberately NOT exempt:** `/api/checkout/sync-line-items` (it mutates a live
Stripe session), `/api/icon` and `/api/branding-font` (both reach dashboard-api,
and the page must not depend on a system being migrated).

---

## The operator bypass

So the team can work the window on the live domain.

```
https://<host>/?hk-maintenance-bypass=<MAINTENANCE_BYPASS_SECRET>
```

That redirects to the same URL without the secret and leaves an httpOnly,
`Secure`, 8-hour cookie behind; every later request from that browser passes
through the gate normally.

It is keyed on a **shared secret, not an IP allowlist**, because the team works
a window from several networks and from mobile — an allowlist would lock out the
people running the cutover, while a secret travels with the person. Keeping it
in a cookie rather than the query string keeps the secret out of the address
bar, browser history and `Referer` headers.

If `MAINTENANCE_BYPASS_SECRET` is unset or shorter than 16 characters, **the
bypass does not exist** — it never degrades into "everyone bypasses". Rotating
it needs a redeploy; revoking it early means clearing the env var, which also
needs one. Treat it as a window-scoped secret.

---

## If the flag cannot be read

Three states, decided deliberately (`lib/maintenance.ts` → `decide()`):

1. **No Edge Config connected** → serve normally. Inert until a store is
   deliberately connected.
2. **Connected, key absent or not `true`** → serve normally.
3. **Connected, read fails** (network, timeout > 1 s, 401, store deleted) →
   **fail closed if this instance has already seen this host darkened**;
   otherwise serve normally.

Case 3 is split rather than a flat fail-closed because the store is team-level
and connected fleet-wide: a flat fail-closed would turn any Edge Config incident
into a fleet-wide outage of stores that were trading normally — a larger and far
more likely harm than the one this gate protects against. Scoping the closed
failure to hosts already known to be dark keeps the window protected from `T+0`
onward, which is the only period where serving a shop that transacts into a
half-migrated backend is possible.

The residual gap is bounded and stated: between the write and a given serving
instance's first successful read of it, a read failure on that instance would
serve the shop. That is closed the way it has to be closed anyway — by verifying
the flip with a request (see the curl above), not by trusting the write.

---

## Proving it

```bash
# requires the local Docker stack (WordPress :8090, commerce :8080, gateway :4000)
bun run test:smoke:maintenance      # production build + real SDK + live flip
bun run test -- lib/maintenance     # unit contract
```

`scripts/smoke/maintenance-gate.sh` builds the storefront for production once,
serves that build, and then flips a real Edge Config item through the real SDK
read path — the build is never rebuilt or restarted for the rest of the run.
That is the only way to make the claim "the flip takes effect without a
redeploy" mean anything. It asserts the 503 and its headers, every exemption,
the bypass with and without the secret, the lift, and both fail-path branches.

Last run: **32/32**, flip observed 45 ms after the write, lift 52 ms after.

One detail that run makes visible: there are two layers in front of a failed
read, and the gate's own is the second. The SDK answers a 5xx from a cached
response of its own, so most transient failures replay the last good value and
never reach the fail path (the 503 still says `x-hk-maintenance: flag`). What
does reach it is a failure the SDK cannot paper over — a revoked token or
deleted store, a network error with a cold cache, or the 1 s timeout — and that
503 says `fail-closed:<reason>`.

---

## Porting this to a storefront repo

Four files and one dependency, and nothing else in the app changes:

- `lib/maintenance.ts`
- `overrides/maintenance.ts` (brand it for that store)
- the gate call at the top of `proxy.ts`
- `@vercel/global-config` in `package.json` — pinned exactly, because the gate
  depends on `consistentRead: true` bypassing the SDK's locally-embedded config
  snapshot, and that is behaviour rather than API surface
- optionally `scripts/smoke/*` + `lib/maintenance.test.ts` to re-prove it there
