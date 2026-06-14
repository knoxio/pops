# Pillar Isolation Audit — Status Update

Companion to [`pillar-isolation-audit.md`](pillar-isolation-audit.md). The original audit (#3215) raised 28 findings: 9 HIGH, 9 MEDIUM, 10 LOW. This doc tracks per-finding status after PRD-240, PRD-241, PRD-242, and PRD-243 landed.

## Summary

| Bucket         | Closed | In Progress | Open   | Needs scoping |
| -------------- | ------ | ----------- | ------ | ------------- |
| HIGH (9)       | 5      | 1           | 3      | 0             |
| MEDIUM (9)     | 1      | 2           | 3      | 3             |
| LOW (10)       | 1      | 1           | 5      | 3             |
| **Total (28)** | **7**  | **4**       | **11** | **6**         |

The four landed PRDs collectively closed 7 findings (5 HIGH, 1 MEDIUM, 1 LOW) — the entire top of the "shell + appRouter + module-registry + settings-barrel" anti-lego cluster. The remaining HIGH bucket is dominated by physical-decomposition work: `db-types` retirement (H6), the cross-pillar FKs that block the per-pillar SQLite split (H7), the cross-pillar runtime imports inside `apps/pops-api/src/modules/` (H8), and the shell↔cerebrum coupling in `CaptureModal` (H9).

## How to read this doc

- **Status**: Closed (merged + verified by the closer's tests), In Progress (PRD scoped + work in flight), Open (PRD scoped, no work started, OR no PRD yet), Needs scoping (no owner; propose one inline).
- **Closer PR / PRD**: the PR that closed the finding (for Closed), or the owning PRD (otherwise).
- **Severity (re-rated)**: original unless context demands a change; deltas explained inline.
- **What remains** (Open only): a one-line description of the residual work.

## HIGH findings

### H1 — `module-registry/scripts/known-modules.ts` hand-curates every pillar

- **Status**: Closed
- **Closer PR**: #3234 (PRD-241 US-02 — workspace-scan replaces `MANIFEST_SOURCES`)
- **Owning PRD**: [PRD-241](../prds/241-registry-driven-known-modules/README.md) (Done — US-01..US-03 all merged: #3229, #3234, #3227)
- **Severity (re-rated)**: HIGH (no change at time of closure)
- **Notes**: The literal `MANIFEST_SOURCES` array is gone; `module-registry` now discovers `@pops/*-contract` workspace packages at build time. External pillars take the ADR-027 runtime path (documented in PRD-241 US-03).

### H2 — `pillar-sdk/src/settings/index.ts` hand-curated SDK barrel

- **Status**: Closed
- **Closer PR**: #3233 (PRD-240 US-05 — delete settings barrel + legacy subpath)
- **Owning PRD**: [PRD-240](../prds/240-settings-as-manifest-dimension/README.md) (Done — US-01..US-05 merged)
- **Severity (re-rated)**: HIGH (no change at time of closure)
- **Notes**: The barrel re-export is deleted. Settings are now a first-class manifest dimension; consumers go through `discoverSettings()` over the registry. The SDK no longer names pillars in its settings surface.

### H3 — `apps/pops-api/src/router.ts` hand-curates every pillar's tRPC router

- **Status**: Closed
- **Closer PR**: #3240 (PRD-242 US-03 — delete static `KNOWN_ROUTERS` literal)
- **Owning PRD**: [PRD-242](../prds/242-dynamic-approuter/README.md) (Done — US-01..US-05 merged: #3232, #3239, #3240, plus US-04 integration test, #3242 dev doc)
- **Severity (re-rated)**: HIGH (no change at time of closure)
- **Notes**: `KNOWN_ROUTERS` literal removed. Workspace-scan codegen drives the in-repo catalogue; `mergeRouters` composes external pillars at runtime. Consumer guidance (typed proxy vs `callDynamic`) is in [`internal-vs-external-pillar-call-sites.md`](internal-vs-external-pillar-call-sites.md).

### H4 — `apps/pops-shell/src/app/installed-modules.ts` hand-curates every pillar's frontend manifest

- **Status**: Closed
- **Closer PR**: #3241 (PRD-243 US-03 — registry-driven installed-modules + nav)
- **Owning PRD**: [PRD-243](../prds/243-registry-driven-shell-ui/README.md) (Done — US-01..US-05 merged, US-04 synthetic-pillar integration test landed at 82a23d6b)
- **Severity (re-rated)**: HIGH (no change at time of closure)
- **Notes**: `KNOWN_FRONTEND_MANIFESTS` literal gone. The shell derives the manifest list from a registry walk + workspace bundle map (the bundle map is the in-repo escape hatch and the seam at which PRD-243 US-05's external-loading mechanism will plug in).

### H5 — `apps/pops-shell/src/app/nav/registry.ts` hand-curates every pillar's nav config

- **Status**: Closed
- **Closer PR**: #3241 (PRD-243 US-03, same PR as H4)
- **Owning PRD**: [PRD-243](../prds/243-registry-driven-shell-ui/README.md)
- **Severity (re-rated)**: HIGH (no change at time of closure)
- **Notes**: `registeredApps` literal gone. App-rail order is now driven by `nav.order` on each pillar's manifest (sparse 10/20/30/… scheme per #3237).

### H6 — `db-types` is a monolithic cross-pillar schema package

- **Status**: In Progress
- **Owning PRD**: ADR-026 migration roadmap (`.claude/pillar-migration-roadmap.md`, gitignored); no dedicated theme-13 PRD
- **Severity (re-rated)**: HIGH (no change)
- **What remains**: 138 schema files in `packages/db-types/src/schema/` still source-of-truth. Each per-pillar `-db` package needs to absorb its own tables (the `ha-bridge-db` pattern). The work is incremental — each cutover PRD moves one domain's tables. L1 (constants) and L6 (mixed-pillar enums) close with it.
- **Proposed owner**: existing per-pillar cutover PRDs in the 165-186 range continue to chip at it. If a tracker is needed, **needs new PRD** for "db-types decomposition tracker".

### H7 — Cross-pillar foreign keys in `packages/db-types/src/schema/`

- **Status**: Open (partly addressed)
- **Owning PRD**: needs new PRD (proposed: "Cross-pillar FK drop" tracker, ~3 user stories — inventory→finance, inventory→core, finance→core)
- **Severity (re-rated)**: HIGH (no change — blocks per-pillar SQLite split)
- **What remains**:
  - `debrief_sessions.watch_history_id` — denormalisation partly landed (`media_type` + `media_id` columns added in commit 9df171fe); schema-level FK declaration still present.
  - `debrief_status.dimension_id` → `comparisonDimensions.id` (cerebrum→media) — not started.
  - `debrief_results.dimension_id`, `debrief_results.comparison_id` (cerebrum→media) — not started.
  - `inventory.purchase_transaction_id` → `transactions.id` (inventory→finance) — not scoped.
  - `inventory.purchased_from_id` → `entities.id` (inventory→core) — not scoped.
  - `transactions.entity_id`, `transaction_tag_rules.entity_id` (finance→core) — not scoped.
- **Proposed owner**: open a new PRD under epic [11 (or wherever H6 lives)](../epics/). 3 user stories — one per pillar pair.

### H8 — Cross-pillar code imports in `apps/pops-api/src/modules/`

- **Status**: In Progress
- **Owning PRD**: [PRD-156](../prds/156-consumer-import-discipline/README.md) gates _new_ violations; the existing list is in `.dependency-cruiser-known-violations.json`. The burn-down lives under [PRD-245](../prds/245-shell-api-pillar-decoupling/README.md) US-04.
- **Severity (re-rated)**: HIGH (no change)
- **What remains**: 8 distinct cross-pillar import sites (core→cerebrum embeddings, core→finance tag vocabulary/corrections, media→cerebrum debrief writes, media→cerebrum debrief reads, media→cerebrum watch-history reads, media→core settings reads across ~10 files). The media→core settings reads alone are ~half the list and could be one "settings read goes through the SDK" PR. The media→cerebrum debrief writes have a design in [`media-watch-history-mixed-tx-design.md`](media-watch-history-mixed-tx-design.md).
- **Proposed owner**: scoped under [PRD-245](../prds/245-shell-api-pillar-decoupling/README.md) US-04 (per-site burn-down with target SDK shape). The core↔finance pair has its own context in [`corrections-finance-coupling.md`](corrections-finance-coupling.md).

### H9 — `apps/pops-shell/src/app/capture/CaptureModal.tsx` couples shell to cerebrum

- **Status**: Open
- **Owning PRD**: [PRD-245](../prds/245-shell-api-pillar-decoupling/README.md) US-01..US-03, US-05 (promotes capture to `frontend.captureOverlay` manifest dimension; shell discovers via registry walk)
- **Severity (re-rated)**: HIGH (no change)
- **What remains**: `CaptureModal.tsx:10` still imports `IngestForm` and `useIngestPageModel` from `@pops/app-cerebrum`. PRD-243 introduced the dimension-driven shell pattern but explicitly scoped capture/overlay slots out. The natural extension is a `frontend.captureOverlay?: { component, hotkey }` manifest dimension that lets cerebrum (or any other pillar) register the active capture form. Multiple-contributor semantics need a one-paragraph rule.

## MEDIUM findings

### M1 — `apps/pops-api/src/modules/installed-modules.ts` hand-imports every backend manifest

- **Status**: Open
- **Owning PRD**: subsumed by ADR-026 migration roadmap (per-pillar `-api` containers) — same dissolution path as H3 but on the manifest side, not the router side.
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: `liveManifests()` still lists 8 hand-imported manifests. PRD-242 closed the router-side counterpart (H3); the manifest-side equivalent needs the same workspace-scan codegen pattern. Trivial to lift from PRD-242 US-01.
- **Proposed owner**: **needs new PRD** OR fold into the PRD-218 module-registry retirement scope.

### M2 — `apps/pops-api/src/db/known-pillars.ts` hand-curates per-pillar migration order

- **Status**: Open
- **Owning PRD**: ADR-026 migration roadmap; closes naturally when the shared journal empties (also closes M5)
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: `KNOWN_PILLARS` literal still hard-codes the 7-pillar order. Filesystem discovery (`packages/*-db/migrations/_journal.json`) is a small, isolated change but nobody has scoped it.

### M3 — `scripts/contract/pillar-list.ts` hand-curates pillars

- **Status**: Open
- **Owning PRD**: **needs new PRD** (trivial — change to a filesystem discovery walk; L4 closes with it)
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: 1-line literal `PILLARS = [...]` drives the per-pillar dependency-cruiser rule generator. The script already runs against the filesystem; switching to a `packages/*-contract/` glob is a 5-line PR.

### M4 — `pnpm-workspace.yaml` hand-lists every package

- **Status**: Open
- **Owning PRD**: **needs new PRD** (trivial — collapse to `packages/*`)
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: Replace per-package entries with `packages/*`. If the explicit list intentionally excluded something (unclear), use `!packages/<x>` instead.

### M5 — `apps/pops-api/src/db/migration-ownership.ts` hand-curates per-tag ownership

- **Status**: In Progress
- **Owning PRD**: ADR-026 migration roadmap (explicit closure plan: "deleted in the final pillar's deletion PR once the shared journal is empty")
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: File still maps every drizzle migration tag (0000..0071) to a pillar id. Each completed per-pillar journal split shrinks the table. No discrete action — closes when H6 closes.

### M6 — `apps/pops-shell/src/tests/manifests.test.ts` hand-imports every pillar's manifest

- **Status**: Closed
- **Closer PR**: 82a23d6b (PRD-243 US-04 — synthetic pillar integration test; commit message labels it "M7" but it is M6 per the original audit's numbering)
- **Owning PRD**: [PRD-243](../prds/243-registry-driven-shell-ui/README.md)
- **Severity (re-rated)**: MEDIUM (no change at closure)
- **Notes**: The test now derives its iteration from `installedFrontendManifests()` over a registry override; no per-pillar named imports remain. The "M7" label in the PRD-243 README and the closing commit is a labelling slip — the audit's M6 is this test file; M7 is i18n. Treat the original audit's numbering as canonical.

### M7 — `apps/pops-shell/src/i18n/index.ts` hand-curates pillar namespaces

- **Status**: Open
- **Owning PRD**: **needs new PRD** (small — manifest slot for `frontend.i18n: { namespace, resources }`, aggregated by the shell at boot)
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: The i18n bootstrap still lists 7 pillar namespaces and hard-codes 7 resource bundles. Same registry-walk pattern as PRD-243; sibling work. External pillars cannot contribute translations until this lands.

### M8 — `infra/docker-compose.yml` hand-enumerates every pillar service

- **Status**: Open
- **Owning PRD**: **needs new PRD** OR fold into CI/infra consolidation alongside L2/L3/L5
- **Severity (re-rated)**: MEDIUM (no change)
- **What remains**: 7 per-pillar service stanzas; the `POPS_PILLARS` env var on `core-api` (line 53) still enumerates every pillar's hostname inline. The remediation (compute `POPS_PILLARS` from `infra/litestream/<id>.yml` directory contents) is small.

### M9 — `apps/pops-shell/src/app/IndexRedirect.tsx` hand-curates default app order

- **Status**: Open
- **Owning PRD**: could fold into a follow-up to PRD-243 (manifest field `frontend.defaultRouteRank?: number`); not currently scoped.
- **Severity (re-rated)**: LOW (downgraded — the catch-all route handles missing pillars; the only real cost is that new pillars are silently invisible to `/`. Now that `nav.order` exists on every manifest per PRD-243, falling back to `nav.order` ascending is a 5-line PR.)
- **What remains**: Replace `APP_ORDER` literal with derivation from `nav.order`. Trivially small now that PRD-243 added the field.
- **Proposed owner**: **needs new PRD** (trivial; could be a single-commit follow-up to PRD-243).

## LOW findings

### L1 — `packages/module-registry/src/generated.ts` is a 1706-line generated file

- **Status**: In Progress
- **Owning PRD**: [PRD-218](../prds/218-module-registry-deprecation/README.md) (module-registry retirement) — closes the entire package, of which this file is part.
- **Severity (re-rated)**: LOW (no change)
- **What remains**: H1 closed the _source_ (`MANIFEST_SOURCES`); `generated.ts` still exists as the build product. PRD-218 retires the whole package.

### L2 — Per-pillar GitHub workflows (`<pillar>-{quality,api-quality,db-quality}.yml`)

- **Status**: Open
- **Owning PRD**: **needs new PRD** (small CI consolidation — also covers L3, L5)
- **Severity (re-rated)**: LOW (no change)
- **What remains**: 23 per-pillar workflow files. The `pillar-images.yml` `discover` job (line 47) already shows the matrix-over-glob pattern; clone it into the quality workflows.

### L3 — `.github/workflows/_pkg-check.yml` hand-lists pillar packages to pre-build

- **Status**: Open
- **Owning PRD**: same CI consolidation PRD as L2/L5 (needs new PRD)
- **Severity (re-rated)**: LOW (no change)
- **What remains**: 22 `--filter` lines duplicated in both `_pkg-check.yml` and `contract-semver.yml`. Replace with a topological filter (`pnpm -r --filter '...^@pops/<entry>' build`) or rely on turbo's `^build` dependency.

### L4 — `.dependency-cruiser.rules.generated.cjs` mirrors the pillar list per rule

- **Status**: Open
- **Owning PRD**: closes when M3 closes (it is the M3 generator's output)
- **Severity (re-rated)**: LOW (no change)
- **What remains**: 7 `no-cross-pillar-runtime-import-<pillar>` rules; collapses to one regex-grouped rule once M3 is filesystem-discovered.

### L5 — `.github/workflows/pillar-schema-coverage.yml` matrix hand-lists pillars

- **Status**: Open
- **Owning PRD**: same CI consolidation PRD as L2/L3 (needs new PRD)
- **Severity (re-rated)**: LOW (no change)
- **What remains**: Workflow's `matrix.pillar` literal + the `-db` package list at lines 39-46. Same `discover` job pattern as `pillar-images.yml`.

### L6 — `packages/db-types/src/constants.ts` mixes pillar-domain constants

- **Status**: Open
- **Owning PRD**: closes with H6 (db-types retirement); each constant moves to its owning pillar's `-contract` (or `-db`) package
- **Severity (re-rated)**: LOW (no change)
- **What remains**: `ENTITY_TYPES`, `WISH_LIST_PRIORITIES`, `MEDIA_TYPES`, `INVENTORY_CONDITIONS` all still co-located. Each moves with its pillar's cutover.

### L7 — Pillar-id switch statements in cerebrum cross-source code

- **Status**: Open
- **Owning PRD**: subsumed by ADR-026 migration roadmap; would benefit from explicit scoping under [PRD-196](../prds/196-search-adapter-manifest/README.md) (search-adapter manifest) since the natural remediation is "each indexable pillar declares its cross-source metadata via the `searchAdapters` manifest slot."
- **Severity (re-rated)**: LOW (no change)
- **What remains**: 4 files in `apps/pops-api/src/modules/cerebrum/` switch on `sourceType` literals. Each indexable pillar needs to contribute its metadata via the `searchAdapters` slot; cerebrum's thalamus then consumes the slot instead of branching on literals.

### L8 — `apps/pops-shell/src/app/pillars/manifest-pillar.ts` is a deliberate no-op shim

- **Status**: Closed
- **Closer PR**: incidentally closes alongside #3241 (PRD-243 US-03) — when the shell rewrote `installed-modules.ts` against the registry walk, `pillarIdForModule()` is no longer load-bearing; manifests now declare their pillar baseUrl directly.
- **Owning PRD**: [PRD-243](../prds/243-registry-driven-shell-ui/README.md) by side-effect
- **Severity (re-rated)**: LOW (no change)
- **Notes**: Worth a follow-up grep to confirm zero callers remain; the file itself may still exist as a dead export. If so, a single-commit deletion PR closes it definitively. (See "Open follow-ups" below.)

### L9 — `packages/pillar-sdk/src/contracts/index.ts` exports finance-only

- **Status**: Open
- **Owning PRD**: **needs new PRD** (trivial — either promote to per-pillar sub-barrels or delete and have consumers import from `@pops/<pillar>-contract` directly)
- **Severity (re-rated)**: LOW (no change)
- **What remains**: 3-line file still re-exports `@pops/finance-contract` types. The SDK should not name pillars; the right fix is to delete and let consumers import directly.

### L10 — Doc references that name pillars in protocol material

- **Status**: Closed (no action required per original audit)
- **Notes**: The audit explicitly logged this as descriptive, not anti-lego. No remediation owed.

## Open follow-ups (proposed new PRDs)

Aggregating the "needs new PRD" entries above so they can be triaged in one pass:

| Finding(s)        | Proposed PRD                                                 | Size    | Notes                                                                                                         |
| ----------------- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| H7                | Cross-pillar FK drop tracker                                 | Medium  | 3 user stories (inventory→finance, inventory→core, finance→core); blocks SQLite split                         |
| H8 + H9           | [PRD-245](../prds/245-shell-api-pillar-decoupling/README.md) | Medium  | Scoped — H9 lands as `frontend.captureOverlay` dimension (US-01..US-03, US-05); H8 burn-down per site (US-04) |
| M1                | Backend `installed-modules.ts` registry-driven               | Small   | Lift PRD-242 US-01 codegen pattern; could fold into PRD-218                                                   |
| M3 + L4           | Filesystem discovery for `scripts/contract/pillar-list.ts`   | Small   | Single trivial change; L4 closes by side-effect                                                               |
| M4                | Collapse `pnpm-workspace.yaml` to `packages/*`               | Trivial | Single-commit PR                                                                                              |
| M7                | i18n manifest slot                                           | Small   | `frontend.i18n: { namespace, resources }` aggregated at shell boot                                            |
| M8 + L2 + L3 + L5 | CI / infra consolidation                                     | Medium  | Single PRD covering compose template + matrix-over-glob in 4 workflow files                                   |
| M9                | `IndexRedirect` derives from `nav.order`                     | Trivial | Single-commit follow-up to PRD-243                                                                            |
| L8                | Delete dead `manifest-pillar.ts` (verify zero callers first) | Trivial | Single-commit cleanup                                                                                         |
| L9                | Delete `pillar-sdk/src/contracts/index.ts`                   | Trivial | SDK should not name pillars                                                                                   |

Adjacent (already-scoped) PRDs that also chip at remaining findings:

- [PRD-218](../prds/218-module-registry-deprecation/README.md) — closes L1; could absorb M1.
- [PRD-156](../prds/156-consumer-import-discipline/README.md) — already gates new H8-shaped violations; the existing violations need their own burn-down PRD.
- [PRD-196](../prds/196-search-adapter-manifest/README.md) — natural home for L7 (cerebrum cross-source dispatch via `searchAdapters` slot).

## Still-open HIGH findings (the short list)

For triage at a glance:

- **H6** — `db-types` decomposition (in progress via per-pillar cutovers; no tracker PRD)
- **H7** — Cross-pillar FKs in `db-types` (partly addressed for debrief; 4 pairs still open)
- **H8** — Cross-pillar code imports in `apps/pops-api/src/modules/` (gated by PRD-156; burn-down scoped under PRD-245 US-04)
- **H9** — `CaptureModal` couples shell to cerebrum (scoped under PRD-245 US-01..US-03, US-05)
