# Provisioning E2E suite — signup → live store (6 QA breakpoints)

`signup-to-store.spec.ts` is the automated guard for the Phase-12 staging gate
and the Phase-14/15 demo + migration QA (PROV-04 criterion 5, E2E-01). It
asserts the six provisioning breakpoints manual QA hit, **in pipeline order**,
each against the dashboard-api store document (never a dashboard-UI scrape):

| #   | Breakpoint                                    | Store-doc evidence                                                                                                    |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| BP1 | store create                                  | minted `pk_` `publicKey`, canonical shape, `secretKeyEnc` never serialized                                            |
| BP2 | GitHub connect callback                       | `gitConnection.owner` + `installationId`                                                                              |
| BP3 | customer repo from `headkit-starter` template | `gitConnection.repoId`/`repoName`                                                                                     |
| BP4 | create-wp-site on the pool site               | `commerceConnection.pressableSiteId` + `providerConfig.baseUrl`; live probe of the site's `headkit/v2` REST namespace |
| BP5 | git mirror → exactly one org repo             | `gitConnection.orgRepoId`/`orgRepoName`, stable across reads                                                          |
| BP6 | Vercel env **before** first deploy            | env names persisted whenever `lastDeploymentID` exists; `HEADKIT_PRIVATE_KEY`/`HEADKIT_NPM_TOKEN` never mirrored      |

## Targeting — no host is ever hardcoded

The suite is **opt-in** and reads its entire target from env
(`playwright.config.ts` stays localhost-only; T-12-10-04):

| Env var                        | Meaning                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `E2E_PROVISIONING=1`           | enable the suite (unset → every test self-skips)                    |
| `PROVISIONING_API_URL`         | dashboard-api base **including** `/api/v1`                          |
| `PROVISIONING_AUTH_TOKEN`      | bearer for `/api/v1` (a Clerk session JWT for a member of the team) |
| `PROVISIONING_TEAM_SLUG`       | team owning the store under test                                    |
| `PROVISIONING_STORE_SLUG`      | store slug under test                                               |
| `PROVISIONING_POLL_TIMEOUT_MS` | optional per-breakpoint budget (default 15 min)                     |

The suite **observes** a provisioning run: kick off signup → create store →
connect GitHub against the target first (UI or operator), then run the suite —
each breakpoint polls until its external effect lands on the store doc.

## Modes

### Local authoring / smoke (default posture — LOCAL-ONLY hard rule)

Run against the local Docker stack + a locally running dashboard-api pair:

```bash
E2E_PROVISIONING=1 \
PROVISIONING_API_URL=http://localhost:<dashboard-api-port>/api/v1 \
PROVISIONING_AUTH_TOKEN=<local Clerk session JWT> \
PROVISIONING_TEAM_SLUG=<team> \
PROVISIONING_STORE_SLUG=<store> \
bunx playwright test e2e/provisioning --project=chromium
```

Local caveat: the full pipeline (Pressable clone, GitHub org mirror, Vercel)
needs real provider credentials in the local dashboard-api env; without them
only BP1/BP2/BP3 can complete locally.

### Staging gate run (12-10 Task 3 — approval required)

Point the `PROVISIONING_*` env at the **staging** dashboard-api and a store
created through the staging dashboard. This touches the staging estate
(Pressable pool, HeadKit org, Vercel team, `headkit_v2_staging`) and runs
**only** behind the explicit human-approved checkpoint — never against prod.

### Regular storefront runs / CI

`bun run test:e2e` and the CI Playwright job never execute this suite:
without `E2E_PROVISIONING=1` every test self-skips before touching the
network.
