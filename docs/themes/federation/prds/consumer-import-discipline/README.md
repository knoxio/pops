# Consumer Import Discipline

> Theme: [Federation](../../README.md)
> Status: Done

## Overview

A consumer must never reach behind a pillar's contract. Cross-pillar code talks
to a peer through that peer's published `@pops/<peer>` package (contract types,
api-types, OpenAPI) and its REST API — never by importing the peer's database
layer, internal services, or any filesystem path inside the peer. Without an
enforced rule this is convention; this PRD makes it a lint gate wired into CI.

The rule lives in the single root `.dependency-cruiser.cjs`, runs as
`pnpm lint:boundaries`, and is gated by the required **Module boundaries** CI
job. A committed known-violations baseline grandfathers the violations that
existed at land time; the baseline may only ever shrink.

This is the cross-pillar consumer slice of the workspace boundary set. The full
unit-isolation rule set (lib→pillar inversion, deep-internal reaches, cycles,
leaf-lib layering) is specified in
[PRD module-import-boundaries](../../../01-foundation/prds/module-import-boundaries/README.md);
this PRD owns the consumer-facing half of it: a pillar may consume another pillar
only through its contract, and the retired per-pillar `*-db` / `*-contract` /
`*-api` packages are tombstoned so no consumer re-imports them.

## What enforces the discipline

Three of the rules in `.dependency-cruiser.cjs` carry the consumer-import
discipline. They fire by the **resolved** module path (dependency-cruiser
follows pnpm symlinks and exports maps), not by the bare specifier, which is why
`dist` stays in `options.doNotFollow` so the dependency edge survives in the
graph.

| Rule                       | From             | Forbidden target                                                                         | Why                                                                                                |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pillar-no-cross-internal` | `pillars/<x>/**` | `pillars/<y>/**` by filesystem path, x ≠ y                                               | Reaching into a peer's `src` / `app` / `db` / `migrations` is a behind-the-contract reach.         |
| `no-deep-internal-import`  | anywhere         | `@pops/<pkg>/(src\|dist\|lib\|internal)/...` — a subpath the exports map doesn't declare | Consuming an undeclared subpath of a published package bypasses its public surface.                |
| `no-dead-<pillar>-pkgs`    | anywhere         | `@pops/<pillar>-db`, `@pops/<pillar>-contract`, `@pops/<pillar>-api` (per pillar)        | Those packages were retired when each pillar collapsed into `pillars/<id>/`. Consume `@pops/<id>`. |

The retirement tombstones are one rule per retired family, with an opinionated
message that names the live replacement:

| Tombstone rule              | Forbidden specifiers                                                                                  | Migration target                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `no-dead-core-pkgs`         | `@pops/core-db`, `@pops/core-contract`, `@pops/core-api`                                              | `@pops/registry`                              |
| `no-dead-finance-pkgs`      | `@pops/app-finance-db`, `@pops/finance-db`, `@pops/finance-contract`, `@pops/finance-api`             | `@pops/finance`                               |
| `no-dead-media-pkgs`        | `@pops/app-media-db`, `@pops/media-db`, `@pops/media-contract`, `@pops/media-api`                     | `@pops/media`                                 |
| `no-dead-inventory-pkgs`    | `@pops/app-inventory-db`, `@pops/inventory-db`, `@pops/inventory-contract`, `@pops/inventory-api`     | `@pops/inventory`                             |
| `no-dead-cerebrum-pkgs`     | `@pops/cerebrum-db`, `@pops/cerebrum-contract`, `@pops/cerebrum-api`                                  | `@pops/cerebrum`                              |
| `no-dead-food-pkgs`         | `@pops/app-food-db`, `@pops/food-db`, `@pops/food-contract`, `@pops/food-contracts`, `@pops/food-api` | `@pops/food`                                  |
| `no-dead-lists-pkgs`        | `@pops/app-lists-db`, `@pops/lists-db`, `@pops/lists-contract`, `@pops/lists-api`                     | `@pops/lists`                                 |
| `no-dead-shared-schema-pkg` | `@pops/shared-schema`                                                                                 | each pillar's own local `src/db/schema/` copy |

`core` is the pillar formerly named `core`; it is `pillars/registry/` and
publishes `@pops/registry`. There is no `pops-api` monolith, no shared
`pops.db`, no `packages/*`, no `apps/` directory — those are all retired naming
and the tombstones exist precisely to stop them coming back.

## Surface

### Scripts (`package.json`)

```jsonc
{
  "scripts": {
    "lint:boundaries": "depcruise --config .dependency-cruiser.cjs --ignore-known --output-type err pillars libs scripts",
    "lint:boundaries:baseline": "depcruise --config .dependency-cruiser.cjs --output-type baseline --output-to .dependency-cruiser-known-violations.json pillars libs scripts",
  },
}
```

`lint:boundaries` cruises `pillars libs scripts`, ignores the committed
baseline, and exits non-zero on any **new** violation. `lint:boundaries:baseline`
regenerates `.dependency-cruiser-known-violations.json` from the current tree —
run it only when a violation has been **fixed** (the baseline shrinks) or an
architecturally-sanctioned exception is intentionally added.

### Known-violations baseline

`.dependency-cruiser-known-violations.json` — a committed flat JSON array of the
violations grandfathered at land time, consumed via `--ignore-known`. It is the
visible tech-debt counter for the boundary set. At rest it holds only:

- `no-circular` cycles inside individual units (mostly pillar internals, some
  libs) that have not yet been broken.
- `pillar-no-cross-internal` for the shell's static `bundle-map.tsx` importing
  each `pillars/<id>/app` entry — sanctioned by ADR-002 (one optimised SPA
  composing the published `@pops/app-*` apps), baselined rather than excepted in
  the rule so the exception is auditable.

The tombstone rules carry **no** live entries: every pillar's data migration is
complete, so no consumer imports a retired package; the rules stand as a guard
against regression.

### CI integration

The required **Module boundaries** job in `quality.yml` runs
`pnpm lint:boundaries`. The whole Quality workflow is `paths-ignore`'d for
docs-only changes (`docs/**`, `**/*.md`), so a docs PR never triggers the
boundary gate.

## Rules

- **Consume the contract, not the internals.** Cross-pillar reads/writes go
  through `@pops/<peer>` types + the peer's REST API. The only way one pillar
  legitimately touches another's data is over HTTP.
- **No "shared" or "common" escape hatch.** A pillar's own internals are reachable
  only from within that pillar. There is no exempt shared package between peers.
- **Tests are not exempt.** A test that reaches into a peer's internals is a
  violation. Use the contract types + factories, or drive the peer's REST API
  against a registered in-memory instance.
- **The violation message names the fix.** Each tombstone message states the live
  replacement package; the structural messages (ISO-R2 / ISO-R3) explain the
  reach and the correct consumption path. No generic "boundary violation."
- **The baseline only shrinks.** New violations fail the gate outright (they are
  not in the baseline). Fixing a violation means re-running
  `lint:boundaries:baseline` and committing the smaller file. A growing baseline
  is itself caught by the non-required Extractability baseline-monotonicity gate
  (EX-3).
- **Source only, not generated output.** `dist`, `build`, `.next`, `coverage`,
  `migrations/`, and `drizzle.config.*` are excluded; `dist` is in `doNotFollow`
  so the symlink edge stays resolvable without cruising compiled files.

## Edge cases

| Case                                                                              | Behaviour                                                                                                                                      |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A pillar needs another pillar's data                                              | Allowed only via `@pops/<peer>` types + the peer's REST API. Direct DB / internal import is a `pillar-no-cross-internal` (or tombstone) error. |
| A worker genuinely needs bulk DB access to a peer for performance                 | Still a violation. If HTTP truly can't serve it, that warrants a dedicated ADR, not an escape hatch baked into the lint rule.                  |
| Test code imports a peer's internals to seed a fixture                            | Violation. Use contract-shaped factories or drive the peer over REST.                                                                          |
| A pillar imports its **own** internals (`pillars/<x>/...` from `pillars/<x>/...`) | Allowed — the rule excludes same-pillar paths.                                                                                                 |
| Importing an undeclared subpath of a published package (`@pops/finance/src/db`)   | `no-deep-internal-import` error. Add an `exports` entry if the surface is meant to be public; otherwise consume a declared subpath.            |
| The shell's `bundle-map.tsx` imports every `pillars/<id>/app`                     | A `pillar-no-cross-internal` edge, sanctioned by ADR-002 and recorded in the baseline so it is auditable rather than silently excepted.        |
| A consumer migrates off a retired `*-db` package                                  | The tombstone rule has nothing to catch; if the migration drained a baselined entry, re-run `lint:boundaries:baseline` and commit the shrink.  |
| Dynamic import of a peer's internals (`await import('pillars/finance/...')`)      | Not caught — dependency-cruiser is static. Accepted residual risk; rare and visible in review.                                                 |
| A docs-only PR                                                                    | The Quality workflow is skipped via `paths-ignore`; the boundary gate does not run.                                                            |

## Acceptance criteria

- [x] `.dependency-cruiser.cjs` forbids a pillar from importing another pillar by
      filesystem path (`pillar-no-cross-internal`).
- [x] `.dependency-cruiser.cjs` forbids importing an undeclared `src`/`dist`/`lib`/`internal`
      subpath of any `@pops/*` package (`no-deep-internal-import`).
- [x] Every retired per-pillar `*-db` / `*-contract` / `*-api` family is tombstoned
      with an opinionated message that names the live `@pops/<pillar>` replacement.
- [x] `@pops/shared-schema` is tombstoned; each pillar owns a local schema copy.
- [x] `pnpm lint:boundaries` runs depcruise over `pillars libs scripts` with
      `--ignore-known` and exits non-zero on any new violation.
- [x] `pnpm lint:boundaries:baseline` regenerates the committed
      `.dependency-cruiser-known-violations.json`.
- [x] The known-violations baseline is committed and contains only cycles plus the
      ADR-002-sanctioned shell bundle-map edges — no live tombstone violations.
- [x] The required **Module boundaries** CI job runs `pnpm lint:boundaries` and is
      skipped for docs-only PRs.
- [x] The tree is green: `lint:boundaries` reports no new violations (82 known
      ignored).

## Out of scope

- Migrating consumers off retired packages — that migration is complete; the
  tombstones now only guard against regression.
- Per-procedure access control ("only finance may call `finance.transactions.create`")
  — an auth concern at the registry / SDK layer, not a lint rule.
- Banning runtime imports between sibling frontend apps beyond what
  `pillar-no-cross-internal` already covers.
- IDE / VSCode warnings — the gate runs at CI and locally via `pnpm lint:boundaries`.
