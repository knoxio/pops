# Pillar Isolation Audit

Goal: identify every place in the codebase where adding a new pillar (or removing an existing one) requires editing shared code. Anti-lego smells, ordered by severity.

The trigger for this audit is the PRD-239 / PRD-240 conversation. PRD-239 physically relocated the ten settings manifests into their owning pillar contract packages, but `packages/pillar-sdk/src/settings/index.ts` still hand-curates a barrel that names every pillar by re-export. That single barrel is the pattern this audit hunts for everywhere else — and the pattern is widespread.

The bar for "anti-lego" is taken from ADR-026 and ADR-035: a pillar is anything that registers with the central registry and exposes a manifest. External pillars (in other repos) work the same as in-repo pillars. The HA bridge pillar (`packages/ha-bridge-db`, `apps/pops-ha-bridge-api`) is the proof-of-concept: it is NOT in any of the hand-curated lists below, and that is correct. Every list that doesn't include `ha-bridge` is a list that wouldn't have to be edited to add a new external pillar — so the test for each in-repo pillar enumeration is "would a fresh external pillar break if it tried to register here?"

## Methodology

- Grep + file reads against the worktree (`feat/theme13-app-inventory-sdk-batch-2` parent, branch `docs/theme-13-pillar-isolation-audit`).
- No code execution. Read-only.
- The 10 categories from the audit brief drive the walk.
- Severity is justified per finding:
  - **HIGH** — blocks the "external pillars work like in-repo pillars" goal, OR forces a platform PR every time a pillar is added/removed.
  - **MEDIUM** — adds real friction (editing 1-3 lines per pillar add) but workable; usually a build-time list that could be a glob.
  - **LOW** — cosmetic, copy-pasted boilerplate, or already documented as transitional and scheduled to retire.

## Findings

### HIGH severity

#### H1 — `packages/module-registry/scripts/known-modules.ts` hand-curates every pillar

`packages/module-registry/scripts/known-modules.ts:52-130` declares `MANIFEST_SOURCES` as a literal array with one entry per in-repo pillar (`core`, `finance`, `food`, `lists`, `media`, `inventory`, `ai`, `cerebrum`, `ego`). Each entry inlines `id`, `name`, `version`, `surfaces`, `description`, `settings`, and `frontend.overlay` config. Adding a new pillar requires editing this file. Removing a pillar requires editing this file. External pillars cannot register here at all.

This file is the source of truth that `pnpm registry:build` consumes to emit `packages/module-registry/src/generated.ts` (1706 lines, all derived from the same in-repo set). Every downstream "is this module installed" check loops over `MODULES` / `KNOWN_MODULES` from that generated file — so this single literal is the canonical anti-lego registry.

- **Why HIGH** — it is the root that every other hand-curation in this audit ultimately mirrors. Adding a pillar (in-repo or external) cannot work until this file knows about it.
- **Remediation** — replace the literal `MANIFEST_SOURCES` array with a build step that discovers `packages/<id>-contract/manifest.{ts,json}` (or `apps/pops-<id>-api/manifest.{ts,json}`) and aggregates them. For external pillars, the runtime registry (ADR-027) already does this via the `POPS_PILLARS` env var + `GET /manifest.json` per registered URL. The build-time `KNOWN_MODULES` is only needed for type narrowing — emit it from the discovered set. Settings manifests landed in per-pillar contract packages by PRD-239 already; the next step is to drop `MANIFEST_SOURCES` and discover via convention.
- **Closed by** — [PRD-241](../prds/241-registry-driven-known-modules/README.md): replaces `MANIFEST_SOURCES` with a build-time discovery walk over `@pops/*-contract` workspace packages. The external-pillar half of the remediation (workspace glob excludes `examples/`; external pillars take the ADR-027 runtime path) is documented in PRD-241 US-03 and cross-referenced from [ADR-027](../../../architecture/adr-027-runtime-pillar-registry.md), [PRD-218](../prds/218-module-registry-deprecation/README.md), and [PRD-233](../prds/233-external-pillar-example-repo/README.md).
- **In-flight** — PRD-218 (module-registry deprecation) still retires the package itself; PRD-241 is a strict predecessor — `module-registry` cannot be retired until its hand-curated `known-modules.ts` is replaced. PRD-218 remains tracked against the broader `module-registry` retirement (and L1 closes with it), not against H1 specifically.

#### H2 — `packages/pillar-sdk/src/settings/index.ts` is a hand-curated SDK barrel

`packages/pillar-sdk/src/settings/index.ts:10-23` re-exports 10 named manifests from per-pillar contract packages (and from `@pops/module-registry/settings` for the not-yet-relocated ones). Adding a settings manifest in a new pillar requires editing this barrel.

- **Why HIGH** — this is the file the user explicitly called out. It also encodes the `@pops/pillar-sdk` -> per-pillar dependency direction, which is wrong on top of being hand-curated: the SDK should not name pillars.
- **Remediation** — replace with `discoverSettings()` per the user's framing of the (not-yet-numbered) "PRD-240": a runtime call over the registry that collects each pillar's `./settings` export via the manifest's declared `settings` slot. The SDK becomes pillar-agnostic.
- **In-flight** — PRD-239 (the relocation) is in progress. PRD-239's design notes call out that the barrel re-export shape stays identical after relocation; the discoverSettings replacement is a separate follow-up that needs its own PRD.

#### H3 — `apps/pops-api/src/router.ts` hand-curates every pillar's tRPC router

`apps/pops-api/src/router.ts:21-51` imports `coreRouter`, `cerebrumRouter`, `egoRouter`, `financeRouter`, `foodRouter`, `inventoryRouter`, `listsRouter`, `mediaRouter` and builds the `KNOWN_ROUTERS` literal that the root tRPC `appRouter` is composed from. Adding a pillar requires editing this file even though `installedManifests()` is already used to compose at runtime — the imports are static.

- **Why HIGH** — same external-pillar test: an external pillar cannot get its tRPC router into this app's `appRouter` regardless of how thoroughly it registers. In post-ADR-026 world this is moot because each pillar owns its own `-api` container, but `apps/pops-api` (the monolith) is still where the migration target points and consumer shells consume `AppRouter` for type narrowing.
- **Remediation** — the planned end state is "no monolith `appRouter`"; per ADR-026 each pillar's `-api` container exports its own typed router and the shell instantiates one tRPC client per pillar. Until then, replace static imports with a dispatcher that fans out by pillar id at runtime (loses static type narrowing — acceptable cost for isolation).
- **In-flight** — ADR-026 migration roadmap (`.claude/pillar-migration-roadmap.md`, gitignored) tracks this. The per-pillar `apps/pops-<id>-api/` apps already exist alongside the monolith.
- **Closed by** — [PRD-242](../prds/242-dynamic-approuter/README.md): workspace-scan codegen for the in-repo catalogue (US-01), runtime `mergeRouters` over registry externals (US-02), deletion of the hand-curated `KNOWN_ROUTERS` literal (US-03), end-to-end external-pillar `callDynamic` integration test (US-04). The consumer-side split (typed proxy for in-repo, `callDynamic` for external) is documented in [internal-vs-external-pillar-call-sites.md](internal-vs-external-pillar-call-sites.md) (US-05).

#### H4 — `apps/pops-shell/src/app/installed-modules.ts` hand-curates every pillar's frontend manifest

`apps/pops-shell/src/app/installed-modules.ts:19-27,57-66` imports 8 frontend manifests by name (`@pops/app-ai`, `@pops/app-cerebrum`, `@pops/app-finance`, `@pops/app-food`, `@pops/app-inventory`, `@pops/app-lists`, `@pops/app-media`, `@pops/overlay-ego`) and lists them in `KNOWN_FRONTEND_MANIFESTS`. The JSDoc explicitly tells future authors: "Adding a new module: add it to `KNOWN_FRONTEND_MANIFESTS` below AND to `packages/module-registry/scripts/known-modules.ts`."

- **Why HIGH** — that JSDoc instruction is the exact failure mode this audit exists to expose. The shell can't mount an external pillar's frontend without being recompiled.
- **Remediation** — fetch manifests from the runtime registry (ADR-027) at boot. The shell becomes a UI pillar (ADR-035) that consumes other pillars' UI surfaces via the registry rather than via workspace imports. This is closely related to PRD-228 (dynamic pillar registration) but extended to the FE manifest dimension.

#### H5 — `apps/pops-shell/src/app/nav/registry.ts` hand-curates every pillar's nav config

`apps/pops-shell/src/app/nav/registry.ts:10-29` imports `navConfig` from `@pops/app-ai`, `@pops/app-cerebrum`, `@pops/app-finance`, `@pops/app-food`, `@pops/app-inventory`, `@pops/app-lists`, `@pops/app-media` and lists them in `registeredApps`. Same shape as H4. Order in this array determines display order in the app rail — meaning the shell also owns presentation ordering for every pillar.

- **Why HIGH** — adding a pillar requires editing this file. External pillars cannot appear in the app rail.
- **Remediation** — derive from the registry. Order can come from the manifest itself (a `navOrder: number` field, or alphabetical by name). Same direction as H4; could be the same fix.

#### H6 — `db-types` is a monolithic cross-pillar schema package

`packages/db-types/src/schema/` holds 138 schema files spanning every domain (cerebrum, core, finance, food, inventory, lists, media, ego). The per-pillar `-db` packages (`media-db`, `cerebrum-db`, `finance-db`, etc.) re-export from `@pops/db-types` rather than owning their tables. Example: `packages/media-db/src/schema.ts:15-29` re-exports 15 media tables from `@pops/db-types`. By contrast, `packages/ha-bridge-db/src/schema.ts` owns its tables locally — that is the correct pattern.

- **Why HIGH** — a schema change in any one pillar rebuilds `@pops/db-types` and therefore rebuilds every pillar that re-exports from it. External pillars cannot fit here at all (they'd have to PR into a shared package).
- **Remediation** — move each table's source into its owning pillar's `-db` package. ADR-026 names this explicitly: "`@pops/db-types` distributes its schemas to each pillar's `-db` package + `core-db`." The work is in progress per the per-pillar migration roadmap.
- **In-flight** — explicit in ADR-026's "What retires" list.

#### H7 — Cross-pillar foreign keys in `packages/db-types/src/schema/`

Several drizzle table definitions in the shared `db-types` schema cross pillar boundaries via `.references()`:

| File:line                                                  | FK                                             | Owner -> Target      | Crosses pillars                                          |
| ---------------------------------------------------------- | ---------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `packages/db-types/src/schema/debrief-sessions.ts:26`      | `watch_history_id` -> `watchHistory.id`        | cerebrum -> media    | YES                                                      |
| `packages/db-types/src/schema/debrief-status.ts:14`        | `dimension_id` -> `comparisonDimensions.id`    | cerebrum -> media    | YES                                                      |
| `packages/db-types/src/schema/debrief-results.ts:15`       | `dimension_id` -> `comparisonDimensions.id`    | cerebrum -> media    | YES                                                      |
| `packages/db-types/src/schema/debrief-results.ts:16`       | `comparison_id` -> `comparisons.id`            | cerebrum -> media    | YES                                                      |
| `packages/db-types/src/schema/inventory.ts:29`             | `purchase_transaction_id` -> `transactions.id` | inventory -> finance | YES                                                      |
| `packages/db-types/src/schema/inventory.ts:32`             | `purchased_from_id` -> `entities.id`           | inventory -> core    | YES                                                      |
| `packages/db-types/src/schema/transactions.ts:18`          | `entity_id` -> `entities.id`                   | finance -> core      | YES                                                      |
| `packages/db-types/src/schema/transaction-tag-rules.ts:17` | `entity_id` -> `entities.id`                   | finance -> core      | YES                                                      |
| `packages/db-types/src/schema/corrections.ts:16`           | `entity_id` -> `entities.id`                   | core -> core         | no (intra-core)                                          |
| `packages/db-types/src/schema/media-scores.ts:14`          | `dimension_id` -> `comparisonDimensions.id`    | media -> media       | no (intra-media; `comparison_dimensions` is media-owned) |

ADR-026 forbids cross-pillar FKs ("Each pillar owns its own SQLite database. No cross-pillar FKs"). PR #3198 (`debrief_sessions.watch_history_id`) already documented that the FK had to be dropped because it can't cross SQLite files; the schema still declares it. PR #3212 noted `media_scores.dimension_id` — which on inspection is intra-media (both belong to media), so it is fine.

- **Why HIGH** — every cross-pillar FK is a blocker for the per-pillar SQLite split. The migration cannot complete while the schema declares foreign keys that won't survive the database split. Each line above is a blocking issue for the pillar that owns the referencing table.
- **Remediation** — drop the FK; replace with a `media_type` + `media_id` denormalisation (already done for `debrief_sessions` per PR #3111 Option D step 1) or a URI-shaped soft reference per ADR-012. For inventory -> finance / core, the same pattern: store the foreign id without the FK constraint and resolve over the wire via the URI dispatcher.
- **In-flight** — debrief denormalisation is partly landed; the other four (inventory -> finance / core, finance -> core) are not yet scoped.

#### H8 — Cross-pillar code imports in `apps/pops-api/src/modules/`

The cross-module import audit (grep for `@pops/<other>-db` from inside `apps/pops-api/src/modules/<src>`) surfaces real cross-pillar coupling, not just shared types:

| Source file                                                                            | Target package                                                             | Coupling                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/pops-api/src/modules/core/embeddings/service.ts`                                 | `@pops/cerebrum-db` (`embeddings`)                                         | core reaches into cerebrum's embeddings table                 |
| `apps/pops-api/src/modules/core/tag-rules/{router,service,preview}.ts`                 | `@pops/finance-db` (`tagVocabularyService`)                                | core reaches into finance's tag vocabulary                    |
| `apps/pops-api/src/modules/core/corrections/handlers/{pattern-match,query-helpers}.ts` | `@pops/finance-db`                                                         | core reaches into finance                                     |
| `apps/pops-api/src/modules/media/comparisons/lib/debrief-record.ts`                    | `@pops/cerebrum-db` (`debriefResults`, `debriefSessions`, `debriefStatus`) | media writes cerebrum's tables in a mixed transaction         |
| `apps/pops-api/src/modules/media/comparisons/lib/debrief-{dismiss,pending}.ts`         | `@pops/cerebrum-db`                                                        | same                                                          |
| `apps/pops-api/src/modules/media/debrief/{service,queue-status}.ts`                    | `@pops/cerebrum-db`                                                        | media owns a `debrief` namespace that touches cerebrum tables |
| `apps/pops-api/src/modules/media/watch-history/handlers/query-helpers.ts`              | `@pops/cerebrum-db`                                                        | media reads cerebrum                                          |
| `apps/pops-api/src/modules/media/{arr,plex,rotation}/...`                              | `@pops/core-db`                                                            | media reads core's `settings` table (~10 files)               |

The `media/*` -> `@pops/core-db` cases are mostly "read a setting from core" — that's ADR-026's "core is a normal pillar" but cross-pillar settings access is still coupling at the source level. ADR-026's intended pattern is the URI dispatcher / per-pillar tRPC call. The other cases (`media/*/debrief/*` -> `cerebrum-db`, `core/corrections|tag-rules` -> `finance-db`, `core/embeddings` -> `cerebrum-db`) are concrete cross-pillar runtime coupling that the `.dependency-cruiser.rules.generated.cjs` rules (`no-cross-pillar-runtime-import-*`) explicitly forbid — and the `.dependency-cruiser-known-violations.json` allow-list keeps them passing CI. (See L4.)

- **Why HIGH** — these are the live counter-examples to the isolation goal. Each one prevents the corresponding pillar pair from splitting into separate containers / SQLite files.
- **Remediation** — convert each cross-pillar read to a tRPC call against the target pillar's `-api` (via the pillar-sdk client). For the media -> cerebrum debrief writes, the design lives in `docs/themes/13-pillar-finale/notes/media-watch-history-mixed-tx-design.md` and is in active migration.
- **In-flight** — partly tracked under the per-pillar migration roadmap; the count is large enough to warrant its own tracker.

#### H9 — `apps/pops-shell/src/app/capture/CaptureModal.tsx` couples shell to cerebrum

`apps/pops-shell/src/app/capture/CaptureModal.tsx:10` imports `IngestForm` and `useIngestPageModel` from `@pops/app-cerebrum`. The "global capture surface" mounted by the shell is hard-wired to cerebrum's ingest form. Removing cerebrum (`POPS_APPS` without `cerebrum`) would still ship this code path — the build would either fail or the modal would mount a cerebrum component that has no backend.

- **Why HIGH** — the shell directly references a pillar package by name for a feature surface. Any "global" feature contributed by a pillar needs to flow through a registry-discoverable extension point, not a direct import.
- **Remediation** — make "capture" a manifest slot (`frontend.captureOverlay?: { component, hotkey }`) and let the shell mount whichever pillar declares it. Multiple pillars could contribute capture forms (e.g. cerebrum for engrams, finance for receipts) and the shell picks the active one.

### MEDIUM severity

#### M1 — `apps/pops-api/src/modules/installed-modules.ts` hand-imports every backend manifest

`apps/pops-api/src/modules/installed-modules.ts:22-29` imports `manifest as <pillar>Manifest` from 8 module folders and lists them in `liveManifests()`. The runtime resolver `installedManifests()` then intersects with `INSTALLED_MODULES`, but the literal still names every pillar.

- **Why MEDIUM, not HIGH** — this is inside `apps/pops-api`, the monolith that ADR-026 plans to dissolve. Once each pillar runs in its own `-api` container, the shape becomes one manifest per app — no list. Today it's still a smell because the file has to be edited per new pillar.
- **Remediation** — same fix as H3: derive at runtime from a convention (`modules/*/index.ts` export `manifest`). The migration to per-pillar `-api` containers eliminates the need entirely.

#### M2 — `apps/pops-api/src/db/known-pillars.ts` hand-curates per-pillar migration order

`apps/pops-api/src/db/known-pillars.ts:59-67` declares `KNOWN_PILLARS` as `['core', 'finance', 'media', 'inventory', 'cerebrum', 'food', 'lists']`. Drives the per-pillar drizzle journal runner at boot.

- **Why MEDIUM** — boot-time migration ordering legitimately needs a deterministic list; can't be discovered at run time without breaking boot ordering. But the file is hand-curated and the addition of a new pillar means a PR here.
- **Remediation** — derive from filesystem (`packages/*-db/migrations/_journal.json`). Order can come from a per-pillar `migrationOrder` field in the manifest, or sort by `id` and accept the trivial breakage if cross-pillar ordering ever matters (today it doesn't — the per-pillar SQLite files are independent).

#### M3 — `scripts/contract/pillar-list.ts` hand-curates pillars

`scripts/contract/pillar-list.ts:1-9` declares `PILLARS = ['core', 'finance', 'media', 'inventory', 'cerebrum', 'food', 'lists']`. Used by `scripts/contract/generate-boundary-rules.ts` to emit the per-pillar `.dependency-cruiser.rules.generated.cjs` (24 references, see L4).

- **Why MEDIUM** — exists to generate the dep-cruiser rules; not on a runtime path. Still hand-curated.
- **Remediation** — derive from `packages/*-contract/` directory listing. The script already runs against the filesystem; trivial change.

#### M4 — `pnpm-workspace.yaml` hand-lists every package

`pnpm-workspace.yaml:2-30` lists each package by name (`packages/app-finance`, `packages/app-food`, `packages/finance-contract`, `packages/finance-db`, etc.) instead of using `packages/*`. The first line uses `apps/*`, so the project knows the glob form; the per-package list is deliberate.

- **Why MEDIUM** — adding a pillar means editing this file. Globbing `packages/*` would remove the need.
- **Remediation** — replace with `packages/*`. The reason for the explicit list is unclear from the file itself; if it was about excluding particular packages, prefer a `!packages/<x>` exclusion.

#### M5 — `apps/pops-api/src/db/migration-ownership.ts` hand-curates per-tag ownership

`apps/pops-api/src/db/migration-ownership.ts:30-118` maps every drizzle migration tag (`0000_naive_chameleon` through `0071_debrief_media_denorm`) to a pillar id. The file's own header documents that it is transitional and shrinks as pillars move to per-pillar journals.

- **Why MEDIUM, not LOW** — it is explicitly transitional (file header: "TRANSITIONAL (pillar-migration P1, ADR-026)"). Still, every new migration in the shared journal has to be added here, and adding a new pillar means adding rows for any historical migrations it owns.
- **Remediation** — none beyond completing the per-pillar migration split; documented end state is "the file is deleted in the final pillar's deletion PR once the shared journal is empty."
- **In-flight** — explicit on the per-pillar migration roadmap.

#### M6 — `apps/pops-shell/src/tests/manifests.test.ts` hand-imports every pillar's manifest

`apps/pops-shell/src/tests/manifests.test.ts:4-12` imports each pillar's manifest and validates structurally. Same shape as H4.

- **Why MEDIUM** — it's a test, not a runtime path. Still requires editing per pillar.
- **Remediation** — derive from `installedFrontendManifests()` (which itself is H4 — needs the same fix first).

#### M7 — `apps/pops-shell/src/i18n/index.ts` hand-curates pillar namespaces

`apps/pops-shell/src/i18n/index.ts:70-82` lists `'inventory', 'cerebrum', 'finance', 'food', 'lists', 'ai', 'media'` as i18n namespaces. The resources block (lines 85+) also hard-codes `inventory: enAUInventory, cerebrum: enAUCerebrum, ...`. Adding a pillar means editing the namespace list, the resources entries, and the i18n bundle import.

- **Why MEDIUM** — i18n bootstrap can plausibly accept lazy namespace registration, but today it doesn't. External pillars cannot register translations.
- **Remediation** — let each pillar's manifest declare its i18n namespace + resources (a manifest slot, e.g. `frontend.i18n: { namespace, resources }`), and have the shell aggregate from the registry. External pillars get their resources loaded via a `GET /i18n/<locale>.json` registry call.

#### M8 — `infra/docker-compose.yml` hand-enumerates every pillar service

`infra/docker-compose.yml:25+` declares `core-api`, `inventory-api`, `finance-api`, `media-api`, `food-api`, `lists-api`, `cerebrum-api` as 7 separate services, each with `container_name`, `image`, `volumes`, `environment` (including the per-pillar `POPS_PILLARS` registry URL list). Adding a pillar means appending another stanza; an external pillar runs outside the compose file entirely.

- **Why MEDIUM** — compose files are platform infrastructure; some duplication is expected. The pattern is consistent (one stanza per pillar). The `POPS_PILLARS` env var on `core-api` enumerates every pillar's hostname inline (line 53 of compose) — and that single line breaks every time a pillar is added or moved.
- **Remediation** — keep one stanza per pillar (templated; production deployment lives in homelab-infra anyway), but compute `POPS_PILLARS` from a per-pillar sidecar manifest (`infra/litestream/<id>.yml` already exists per pillar; reuse the directory). Or fetch the registry from a sidecar service.

#### M9 — `apps/pops-shell/src/app/IndexRedirect.tsx` hand-curates default app order

`apps/pops-shell/src/app/IndexRedirect.tsx:14` declares `APP_ORDER = ['finance', 'media', 'inventory', 'cerebrum'] as const` — the order in which the `/` redirect picks an installed app. Adding a new pillar means deciding where it lands in this priority list.

- **Why MEDIUM** — the file itself acknowledges it's "the historical default" and that the catch-all route handles missing pillars. Still, the order is hand-curated and new pillars are silently invisible to `/`.
- **Remediation** — derive from a manifest field (`frontend.defaultRouteRank?: number`), or fall back to alphabetical by `id`. Either eliminates the hand-curation.

### LOW severity

#### L1 — `packages/module-registry/src/generated.ts` is a 1706-line generated file

`packages/module-registry/src/generated.ts` is autogenerated from H1's `known-modules.ts`. Every settings field on every pillar is inlined here. The file is checked in (CI verifies it is up to date).

- **Why LOW** — it's generated; the source of truth is H1. Fixing H1 fixes this.
- **Remediation** — closes when H1 closes.

#### L2 — Per-pillar GitHub workflows (`<pillar>-{quality,api-quality,db-quality}.yml`)

`.github/workflows/` has 23 per-pillar workflow files (`cerebrum-db-quality.yml`, `finance-api-quality.yml`, `media-quality.yml`, etc.) — three per pillar (db, api, frontend) for each of 7 pillars, plus a couple of orphans. Each file is a 30-50 line scaffold that points at a specific package path. Adding a pillar requires adding 3 workflow files.

- **Why LOW** — each file is independent. The pattern is mechanical (same template, package path swapped). External pillars wouldn't use these at all — they own their own CI.
- **Remediation** — collapse into a single workflow that uses a matrix over a glob (the `pillar-images.yml` workflow already does this — see its `discover` job at line 47). Use the same `find packages/*-api/package.json` pattern.

#### L3 — `.github/workflows/_pkg-check.yml` hand-lists pillar packages to pre-build

`.github/workflows/_pkg-check.yml:44-66` runs `pnpm --filter @pops/<x> build` for every pillar's db, contract, and a couple of meta packages (22 filters total). Same block is duplicated for the test job (lines 92-113). The same hand-list also appears in `.github/workflows/contract-semver.yml`.

- **Why LOW** — pre-build is a CI optimisation, not a structural smell. But adding a new pillar means editing the prelude in two workflows.
- **Remediation** — `pnpm -r --filter '...^@pops/<entry>' build` or similar topological filter computed from the package being checked. Or rely on turbo's `^build` dependency rather than hand-pre-building.

#### L4 — `.dependency-cruiser.rules.generated.cjs` mirrors the pillar list per rule

`.dependency-cruiser.rules.generated.cjs` (generated from M3's `scripts/contract/pillar-list.ts`) emits one `no-cross-pillar-runtime-import-<pillar>` rule per pillar. 7 rules today, scales linearly with pillar count.

- **Why LOW** — it's generated. Closes when M3 closes.
- **Remediation** — closes when M3 closes. Also worth noting: the rule pattern is identical across pillars, so a single rule with a regex group (`^packages/([^/]+)-db/`) could replace all 7.

#### L5 — `.github/workflows/pillar-schema-coverage.yml` matrix hand-lists pillars

`.github/workflows/pillar-schema-coverage.yml:29` declares `matrix: pillar: [finance, core, media, inventory, cerebrum, food, lists]`. Same workflow's build step (lines 39-46) hand-lists pillar `-db` packages.

- **Why LOW** — workflow-level enumeration; consistent with the per-pillar workflow pattern.
- **Remediation** — discover via a `discover` job (like `pillar-images.yml` does, lines 47-72) and emit the matrix from the filesystem.

#### L6 — `packages/db-types/src/constants.ts` mixes pillar-domain constants

`packages/db-types/src/constants.ts:2-26` declares `ENTITY_TYPES` (finance/core), `WISH_LIST_PRIORITIES` (finance), `MEDIA_TYPES` (media), `INVENTORY_CONDITIONS` (inventory) in one file. Cross-pillar mixing.

- **Why LOW** — each constant is small and they're decoupled from each other. Goes away with H6 (db-types retirement); each constant moves to its owning pillar's `-contract` package.
- **Remediation** — move each `ENUM` to its owning pillar's `-contract` (or `-db`) package. Same direction as H6.

#### L7 — Pillar-id switch statements in cerebrum cross-source code

Three files in `apps/pops-api/src/modules/cerebrum/` branch on hard-coded source-type literals that happen to be pillar ids (`'transaction'`, `'movie'`, `'tv_show'`, `'inventory'`):

- `apps/pops-api/src/modules/cerebrum/thalamus/cross-source.ts:109-135` — dispatches indexing logic per source type.
- `apps/pops-api/src/modules/cerebrum/retrieval/semantic-search-helpers.ts:101-114` — derives a title per source type.
- `apps/pops-api/src/modules/cerebrum/retrieval/semantic-search-metadata.ts:69+` — same shape.
- `apps/pops-api/src/modules/cerebrum/query/citation-parser.ts:61-76` — extracts metadata per `sourceType` (`'transaction'`, `'media'`, `'inventory'`).

- **Why LOW** — these are not strictly pillar-id switches; they branch on `sourceType` which is a cross-source vocabulary. Adding a new pillar that wants to participate in cerebrum cross-source indexing means editing each file. External pillars cannot.
- **Remediation** — each indexable pillar declares its cross-source metadata via a manifest slot (`searchAdapters` is the natural home — already exists per ADR-035). The cerebrum thalamus consumes the slot rather than branching on a hard-coded literal. Closely related to the H8 cross-module imports; same direction.

#### L8 — `apps/pops-shell/src/app/pillars/manifest-pillar.ts` is a deliberate no-op shim

`apps/pops-shell/src/app/pillars/manifest-pillar.ts:36-38` declares `pillarIdForModule()` that always returns `'core'`. The file's JSDoc documents this as a temporary stub during the per-pillar migration: as each pillar splits out, the function flips that pillar's mapping.

- **Why LOW** — already documented as transitional. The plan is to delete the file once every pillar runs in its own container.
- **Remediation** — none beyond completing the per-pillar migration. The function's purpose disappears when each module's manifest declares its own pillar baseUrl.

#### L9 — `packages/pillar-sdk/src/contracts/index.ts` exports finance-only

`packages/pillar-sdk/src/contracts/index.ts:1-3` exports types from `@pops/finance-contract`. Only finance — the file is finance-specific despite living in a generic-sounding location.

- **Why LOW** — small file; the deliberate JSDoc on `packages/pillar-sdk/src/index.ts:8-13` explains why `contracts/` is not on the root barrel (TS would force resolution of every pillar contract for every consumer). Still, the convenience helper is finance-only, and adding the same for other pillars means editing this barrel.
- **Remediation** — promote to per-pillar sub-barrels (`@pops/pillar-sdk/contracts/finance`, etc.) or, better, drop the indirection and let consumers import from `@pops/<pillar>-contract` directly. The SDK should not name pillars.

#### L10 — Doc references that name pillars in protocol material

A spot-check across `docs/architecture/adr-026-pillar-architecture.md`, `adr-035-pillar-redefinition-and-implicit-kinds.md`, and the theme-13 PRDs shows ADRs and PRDs naming pillars where it makes pedagogical sense. None of these are anti-lego smells — they describe the system, not enumerate it.

- **Why LOW (no action)** — surfaced for completeness because the audit brief asks; nothing to fix.

## Already in flight / known

- **PRD-239** (settings manifest physical relocation) — relocates 10 settings manifests from `module-registry` into per-pillar `-contract/settings`. Does NOT eliminate the `pillar-sdk/settings` barrel itself — just changes where it re-exports from. Closes the H2 _location_ but not its hand-curation shape.
- **"PRD-240"** (not yet numbered; user described as the discoverSettings replacement) — proposes replacing the hand-curated `pillar-sdk/settings/index.ts` with a runtime `discoverSettings()` over the registry. Closes H2.
- **PRD-241** (registry-driven `known-modules`) — replaces the `MANIFEST_SOURCES` literal with a workspace discovery walk. Closes H1. Strict predecessor to PRD-218.
- **PRD-218** (module-registry deprecation) — retires `@pops/module-registry`. Closes L1; depends on PRD-241 for the build-script reshape that frees the package to be retired.
- **ADR-026 migration roadmap** (private, `.claude/pillar-migration-roadmap.md`) — drives the per-pillar `-db` / `-api` split. Closes H3, H6, M1, M2, M5, L7, L8.
- **PRD-228** (dynamic pillar registration) — runtime registry growth. Adjacent to H4, H5, H9, M7.
- **PRD-156** (consumer import discipline) — produces `.dependency-cruiser.rules.generated.cjs`. Already gates new cross-pillar imports; existing violations are tracked in `.dependency-cruiser-known-violations.json` and itemised by H8.
- **PR #3198** (debrief mixed-tx redesign) — partly closes H7 for `debrief_sessions.watch_history_id`. The FK was already dropped at the SQL level; the schema declaration is still in `db-types`.
- **PR #3212** (media_scores + rotation FKs) — confirmed intra-media (not cross-pillar). Not a finding.

## Estimated follow-up PRDs

Counting the findings that don't fold into an existing PRD:

1. **discoverSettings replacement** (H2) — the user's "PRD-240"; ~1 small PRD.
2. **Pillar discovery for `module-registry` build** (H1, L1) — could fold into PRD-218 or run as its own ~1 medium PRD.
3. **Shell registry-driven manifest aggregation** (H4, H5, M6, M7, M9) — likely PRD-228's scope or a sibling; ~1 large PRD.
4. **Cross-pillar code-import remediation in `apps/pops-api`** (H8) — ~1 medium tracker PRD with per-pair user stories.
5. **Cross-pillar FK drop in `db-types`** (H7) — ~1 small PRD per FK pair (inventory -> finance, inventory -> core, finance -> core); 3 user stories.
6. **CaptureModal extraction to manifest slot** (H9) — ~1 small PRD.
7. **CI workflow consolidation** (L2, L3, L5) — ~1 small infra PRD.
8. **db-types decomposition** (H6, L6) — already on the migration roadmap; if it needs a PRD, ~1 large tracker.

Rough estimate: 5-8 follow-up PRDs, weighted heavily toward small/medium. The two structurally hardest are H6 (db-types decomposition) and H4/H5 (shell registry-driven).

## Recommended next steps

1. Land the "PRD-240" discoverSettings replacement (closes H2) — small, high-symbolic-value win that ratifies the discovery pattern.
2. Apply the same pattern to H1 (module-registry's `MANIFEST_SOURCES`): replace the literal with discovery over `packages/*-contract/manifest.{ts,json}`. This removes the root anti-lego registry.
3. Drop the cross-pillar FKs in H7 — they are already documented as logically broken and block the per-pillar SQLite split.
4. Itemise the H8 cross-pillar imports under PRD-156 and burn them down incrementally. Most are core <-> finance settings reads — a single "settings read goes through the SDK" PR could close half the list.
5. Treat H4, H5, M7 as a single shell-side workstream; they all want the same fix (registry-driven aggregation). Likely a Theme 13 epic of its own.
6. Open a small CI consolidation PR (L2, L3, L5) that templates the per-pillar workflows on a matrix derived from `packages/*-api/package.json`. Mirrors what `pillar-images.yml` already does.
