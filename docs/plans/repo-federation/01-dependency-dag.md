# 01 — Dependency DAG, Move-Order, Parallel Groups & Conflict Matrix

> Authoritative internal dependency graph for the POPS federation (type-first → provider-first: `pillars/` + `libs/`).
> Source: SHARED ANALYSIS `DEPENDENCY-DAG`. Cross-references: `00-architecture.md`, `03-execution-phases.md`, `02-build-system.md`, `04-isolation-enforcement.md`, `05-cicd-deployment.md`, `06-registry-decoupling.md`, `07-risks.md`.
> **Task IDs here use the analysis-family aliases (`G0`/`G1`, `R1-*`/`R2-*`/`R3-*`, `C-T*`, `G-T*`).** These are aliases for the canonical `P*-T*` tasks defined in `03-execution-phases.md`; resolve any alias via the crosswalk in `00-architecture.md` §7.1 (e.g. `R1-T06`=`P2-T01`, `G-T01`=`P5-T01`, `C-T04`=`P4-T04`).
> Verified against every `package.json` on `main` (`fb56d4d0`). 30 TS workspace units + 3 rust crates.

---

## 0. Graph-verification drift (vs. mission brief)

The brief's internal graph is **accurate**. The findings below change a few task scopings; they do **not** contradict the brief, they refine it.

| #      | Brief claim                                              | Actual (from `package.json`)                                                                                                                   | Impact                                                                                                                                                                                                                                                                       |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1     | `app-finance → db-types finance navigation sdk types ui` | Confirmed: `@pops/db-types,@pops/finance,@pops/navigation,@pops/pillar-sdk,@pops/types,@pops/ui`                                               | none                                                                                                                                                                                                                                                                         |
| D2     | `app-inventory → db-types inventory navigation types ui` | Confirmed exactly (no sdk)                                                                                                                     | none                                                                                                                                                                                                                                                                         |
| D3     | `media → sdk settings types`                             | Confirmed                                                                                                                                      | none                                                                                                                                                                                                                                                                         |
| D4     | `inventory → sdk settings types`                         | Confirmed                                                                                                                                      | none                                                                                                                                                                                                                                                                         |
| D5     | `app-media → navigation sdk types ui`                    | Confirmed (includes `@pops/pillar-sdk`)                                                                                                        | none                                                                                                                                                                                                                                                                         |
| **D6** | storybook FOLDS into ui                                  | storybook dep-set = `app-* + ui`; it is a **second** all-`app-*` aggregator besides shell                                                      | **Reject naïve fold.** Folding into `libs/ui` would make `libs/ui` transitively depend on every frontend. Storybook must consume `app-*` as a **dev surface only** (`devDependency`, not exported). See critical-path notes + `03-execution-phases.md` Phase 2 (relocation). |
| **D7** | root tsconfig has project references / path aliases      | **NEITHER EXISTS.** No root `tsconfig.json` `references`, no `paths` map. Resolution = 100% pnpm-workspace symlink + each package's `exports`. | The `tsc -b` ordering is **greenfield authoring, not migration** (`02-build-system.md`). turbo's `^build` is the _only_ build ordering today.                                                                                                                                |
| **D8** | `pnpm-workspace.yaml` globs                              | `apps/*`, `packages/*`, `pillars/*`, `pillars/*/*`                                                                                             | `pillars/*/*` already captures `pillars/<x>/app` + `pillars/cerebrum/overlay-ego`. Moving pillars is glob-free; **dissolving `apps/*` + `packages/*` requires editing this file** — a serializing gate.                                                                      |
| **D9** | contacts is sole rust pillar; crates workspace           | Confirmed. `members = ["../pillars/contacts","pops-ai","pops-settings"]`, one lockfile                                                         | Moving rust libs edits `members` relative paths in the single `Cargo.toml` — serializing for all rust units.                                                                                                                                                                 |

**Net surprises:** **D7** (no existing tsc-b graph — net-new) and **D6** (storybook is a hidden second aggregator).

---

## 1. Authoritative internal dependency graph (`@pops/*` edges only)

`→` = depends-on. Build kind drives the build-system design (`02-build-system.md`).

| Unit (npm name)         | Internal deps (`@pops/*`)                                                       | Build kind                                                                   |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@pops/types`           | —                                                                               | COMPILED lib (emits `dist/` + `.d.ts`)                                       |
| `@pops/db-types`        | —                                                                               | COMPILED lib                                                                 |
| `@pops/pillar-sdk`      | —                                                                               | COMPILED lib                                                                 |
| `@pops/pillar-settings` | —                                                                               | COMPILED lib                                                                 |
| `@pops/ai-telemetry`    | —                                                                               | COMPILED lib                                                                 |
| `@pops/ui`              | types                                                                           | SOURCE lib (no build; bundler-consumed)                                      |
| `@pops/navigation`      | pillar-sdk, ui                                                                  | SOURCE lib                                                                   |
| `@pops/overlay-ego`     | types, ui                                                                       | SOURCE lib (consumed by shell + app-cerebrum)                                |
| `@pops/module-registry` | **ai, cerebrum, core, finance, food, inventory, lists, media**, types           | COMPILED lib — **HOTSPOT 1** (lib imports all pillars; emits `generated.ts`) |
| `@pops/core`            | pillar-sdk, pillar-settings, types                                              | PILLAR backend (emits `dist/`; Dockerized)                                   |
| `@pops/ai`              | ai-telemetry, pillar-sdk, pillar-settings, types                                | PILLAR backend                                                               |
| `@pops/cerebrum`        | ai-telemetry, pillar-sdk, pillar-settings, types                                | PILLAR backend                                                               |
| `@pops/finance`         | ai-telemetry, pillar-sdk, pillar-settings, types                                | PILLAR backend                                                               |
| `@pops/food`            | ai-telemetry, pillar-sdk, types                                                 | PILLAR backend                                                               |
| `@pops/inventory`       | pillar-sdk, pillar-settings, types                                              | PILLAR backend                                                               |
| `@pops/lists`           | pillar-sdk, types                                                               | PILLAR backend                                                               |
| `@pops/media`           | pillar-sdk, pillar-settings, types                                              | PILLAR backend                                                               |
| `@pops/app-ai`          | navigation, types, ui                                                           | SOURCE frontend (no build; vite-bundled by shell)                            |
| `@pops/app-cerebrum`    | navigation, overlay-ego, pillar-sdk, types, ui                                  | SOURCE frontend                                                              |
| `@pops/app-finance`     | db-types, **finance**, navigation, pillar-sdk, types, ui                        | SOURCE frontend (depends on its own pillar contract — good)                  |
| `@pops/app-food`        | **food**, types, ui                                                             | SOURCE frontend                                                              |
| `@pops/app-inventory`   | db-types, **inventory**, navigation, types, ui                                  | SOURCE frontend                                                              |
| `@pops/app-lists`       | **lists**, types, ui                                                            | SOURCE frontend                                                              |
| `@pops/app-media`       | navigation, pillar-sdk, types, ui                                               | SOURCE frontend                                                              |
| `@pops/shell`           | **all app-\***, module-registry, navigation, overlay-ego, pillar-sdk, types, ui | PILLAR(web) aggregator — **HOTSPOT 2**                                       |
| `@pops/storybook`       | **all app-\***, ui                                                              | aggregator → FOLD into `libs/ui` as dev surface (**D6**)                     |
| `@pops/mcp`             | pillar-sdk                                                                      | PILLAR                                                                       |
| `@pops/orchestrator`    | pillar-sdk, types                                                               | PILLAR                                                                       |
| `@pops/docs`            | —                                                                               | PILLAR                                                                       |
| moltbot (no npm name)   | — (config/skills only)                                                          | PILLAR                                                                       |
| `@pops/cli`             | —                                                                               | **DROP**                                                                     |
| `pops-ai` (rust)        | —                                                                               | LIB (cargo, leaf)                                                            |
| `pops-settings` (rust)  | —                                                                               | LIB (cargo, leaf)                                                            |
| `contacts` (rust crate) | — (no TS edges)                                                                 | PILLAR (cargo)                                                               |

---

## 2. Topological layering (build-order truth)

Layers = longest-path depth. Each layer depends only on shallower layers.

| Layer                       | Units                                                                                                                                           | In-edges               | Notes                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| **L0** (zero internal deps) | `types`, `db-types`, `pillar-sdk`, `pillar-settings`, `ai-telemetry`, `docs`, `cli`                                                             | none                   | 5 compiled leaf libs (build:y) + docs/cli (no deps). **Movable-first set.** |
| **L1**                      | `ui`(→types), `core`, `ai`, `cerebrum`, `finance`, `food`, `inventory`, `lists`, `media`, `mcp`(→sdk), `orchestrator`(→sdk,types)               | L0 only                | pillar backends emit dist; `ui` = source lib                                |
| **L2**                      | `overlay-ego`(→types,ui), `navigation`(→sdk,ui), `app-food`(→food,types,ui), `app-lists`(→lists,types,ui), `module-registry`(→8 backends+types) | L0+L1                  | source frontends; module-registry emits `generated.ts`                      |
| **L3**                      | `app-ai`, `app-media`, `app-inventory`, `app-finance`                                                                                           | L0–L2                  | source frontends                                                            |
| **L3b**                     | `app-cerebrum`(→navigation,overlay-ego,sdk,types,ui)                                                                                            | needs overlay-ego (L2) | source frontend                                                             |
| **L4**                      | `shell`(→all app-_, module-registry, navigation, overlay-ego, sdk, types, ui), `storybook`(→all app-_, ui)                                      | L0–L3b                 | aggregators                                                                 |
| **Rust**                    | `pops-ai`, `pops-settings` (leaf libs), `contacts` (pillar; no TS edges)                                                                        | independent lane       | cargo                                                                       |

**Movable-first set (L0):** `types, db-types, pillar-sdk, pillar-settings, ai-telemetry` + `pops-ai, pops-settings` (rust). Safest relocations; front of every parallel wave.

> **Layering ≠ move-order.** Build layering drives `tsc -b` (Phase G). Relocation order is dictated by **shared-config contention**, not layering (see §3).

---

## 3. Move-order DAG (relocation; tree stays green every PR)

**Core principle:** all consumption is by **npm name** (`@pops/x`) over pnpm-workspace symlinks. `git mv` of a unit's directory **breaks no importer** — pnpm re-resolves on `pnpm install`. The only things that break are **path-literals in shared config** (workspace globs, depcruise regexes, compose `dockerfile:`, workflow path-globs/`cd`, Cargo `members`, Dockerfile `COPY`). Therefore move-order is governed by shared-config contention, gated at the boundaries by **G0** and **G1**.

```
P0  working-tree cleanup PR (already green per brief)
 │
 ├─ G0  SERIAL gate — add 'libs/*' (+ 'libs/*/*') to pnpm-workspace.yaml BEFORE any lib move
 │
 ├──────── RELOCATION WAVES (3 concurrent lanes off G0) ────────
 │
 │  Wave R1  (TS lib moves; depend on G0):
 │     R1-T01  git mv packages/types            → libs/types
 │     R1-T02  git mv packages/db-types         → libs/db-types
 │     R1-T03  git mv packages/pillar-sdk       → libs/sdk         (dir rename; npm name UNCHANGED — see note)
 │     R1-T04  git mv packages/pillar-settings  → libs/settings    (dir rename; npm name UNCHANGED)
 │     R1-T05  git mv packages/ai-telemetry     → libs/ai-telemetry
 │     R1-T06  git mv packages/ui               → libs/ui
 │     R1-T07  git mv packages/navigation       → libs/navigation
 │     R1-T08  git mv packages/module-registry  → libs/module-registry
 │     R1-T09  git mv pillars/cerebrum/overlay-ego → libs/overlay-ego   (classify-as-lib; pure git mv)
 │
 │  Wave R2  (rust libs; SERIAL among themselves — shared Cargo.toml/Cargo.lock):
 │     R2-T01  git mv crates/pops-ai       → libs/pops-ai      ┐
 │     R2-T02  git mv crates/pops-settings → libs/pops-settings├ one PR or strictly serial
 │     R2-T03  relocate crates/Cargo.toml + Cargo.lock; fix members rel-paths ┘
 │
 │  Wave R3  (apps → pillars; each app its own dir, mostly independent):
 │     R3-T01  git mv apps/pops-mcp          → pillars/mcp
 │     R3-T02  git mv apps/pops-orchestrator → pillars/orchestrator
 │     R3-T03  git mv apps/pops-docs         → pillars/docs
 │     R3-T04  git mv apps/moltbot           → pillars/moltbot
 │     R3-T05  git mv apps/pops-shell        → pillars/shell
 │     R3-T06  fold apps/pops-storybook      → libs/ui dev surface   [depends R1-T06]
 │     R3-T07  DROP apps/pops-cli (git rm -r)                        [independent]
 │
 │  (pillars/ai..media + pillars/contacts already under pillars/ — NO MOVE.
 │   Internal layout src/{api,contract,db}+app untouched by federation.)
 │
 ├─ G1  SERIAL gate — remove 'apps/*' & 'packages/*' globs; git rm -r empty apps/ packages/ crates/
 │       (after ALL R waves merge)
 │
 ├─ Phase C  config retarget (1 task per shared file → file-disjoint, all parallel; see §5):
 │     C-T01 .dependency-cruiser.cjs (overlay-ego path + ISO rule retargets)
 │     C-T02 infra/docker-compose.yml + .dev.yml (dockerfile: paths, moltbot bind-mounts)
 │     C-T03 .github/workflows/*-quality.yml package-path: packages/* → libs/*
 │     C-T04 .github/workflows/fe-quality.yml + storybook-quality.yml path globs
 │     C-T05 .github/workflows/publish-images.yml app matrix → pillars/*
 │     C-T06 .github/workflows/orchestrator/module-registry paths + --filter
 │     C-T07 moved-app Dockerfiles: COPY contexts packages/* → libs/*, apps/x → pillars/x
 │
 ├─ Phase G  build model (DROP turbo, add mise + tsc -b)  [LAST; needs final tree]
 │     G-T01 CREATE root tsconfig project-references graph (does NOT exist today — D7)
 │     G-T02 per-unit mise.toml (toolchain + build/test/typecheck/lint entrypoints)
 │     G-T03 replace root package.json turbo scripts w/ mise + tsc -b + pnpm -r
 │     G-T04 CI matrix: discover-from-disk for libs/ + changed-only
 │     G-T05 module-registry registry:build de-turbo
 │     G-T06 remove turbo dep + turbo.json
 │
 └─ Phase RD  north-star (registry decoupling — out of scope of pure relocation, unblocked here)
        See 06-registry-decoupling.md (RD-1 … RD-9)
```

### sdk/settings dir-rename note (R1-T03 / R1-T04)

Target dir names are `libs/sdk` / `libs/settings`; npm names stay `@pops/pillar-sdk` / `@pops/pillar-settings`. **Do NOT rename the npm package during relocation** — that is a graph-wide rewrite (~12 importers + depcruise tombstones + `--filter` references) for zero litmus-test gain. Dir name ≠ package name is fine. Defer any rename to a separate optional post-migration PR.

### Why relocations are green-safe within a wave

`pnpm install` after `git mv` rewrites symlinks; `@pops/x` importers never see the path. The hard gates are **G0** (glob exists before moves land) and **G1** (glob cleanup after moves) — these serialize the relocation phase at its boundaries only.

---

## 4. Parallel groups + critical path

A parallel group = tasks with **no shared file** and **no ordering edge**, runnable in separate git worktrees concurrently.

| Group                   | Tasks                                                 | Concurrency                          | Shared-file risk                                              |
| ----------------------- | ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| **PG-A** (after G0)     | R1-T01…R1-T09 (9 TS lib moves)                        | 9-wide _in theory_                   | each own subtree; `pnpm-lock.yaml` co-touched → lockfile note |
| **PG-B** (after G0)     | R3-T01…R3-T05, R3-T07 (5 app→pillar moves + cli drop) | 6-wide                               | own subtrees; `pnpm-lock.yaml`                                |
| **PG-C** (after G0)     | R2-T01…R2-T03 (rust)                                  | **1-wide (serial)**                  | all touch `crates/Cargo.toml` + `Cargo.lock`                  |
| **PG-D** (after R1-T06) | R3-T06 storybook fold                                 | 1, parallel to PG-B/PG-C             | needs `libs/ui` present                                       |
| **PG-E** (after G1)     | C-T01…C-T07 config retargets                          | up to 7-wide                         | one task per shared file → file-disjoint → all 7 parallel     |
| **PG-F** (after PG-E)   | G-T01…G-T06 build model                               | partially serial (G-T03 gates G-T06) | root `package.json` + `tsconfig` + `turbo.json`               |

### CRITICAL PATH (longest serial chain)

```
P0 → G0 → R1-T06 (ui) → R3-T06 (storybook fold) → G1 → C-T04 (fe/storybook globs)
   → G-T01 (tsconfig refs) → G-T03 (de-turbo scripts) → G-T06 (remove turbo) → G-T04 (CI matrix)
```

- `ui` (R1-T06) is on the path: both `storybook` and `shell` resolve through it, and the storybook fold can't start until ui is home.
- Phase G is intrinsically last (depends on the _final_ directory shape) and intrinsically partly serial (tsconfig refs → script swap → turbo removal → CI).
- Everything else (8 other lib moves, 5 app→pillar moves, rust) hangs off G0 in wide parallel and **finishes well before** the critical-path tail.
- **Critical-path length ≈ 9 serial PRs.** Dominant _authoring_ risk is the non-existent root tsc-b graph (**D7** — net-new, not migration).

### Lockfile contention — the real concurrency limiter

Every relocation touches `pnpm-lock.yaml` (a `git mv` of a workspace package rewrites its `importers:` key path). Parallel relocation PRs **conflict on the lockfile** even though source files are disjoint. Two strategies:

| Strategy                         | Mechanism                                                                                       | Trade-off                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Wave-batched PRs (PREFERRED)** | PG-A = 1 PR moving all 9 libs; PG-B = 1 PR moving the apps; PG-C = 1 PR rust                    | Loses intra-wave parallelism; eliminates lockfile thrash. Moves are mechanical `git mv` + one `pnpm install` — cheap. |
| Per-unit PRs (true parallelism)  | each PR omits the lockfile; a serial lockfile-reconcile task runs `pnpm install` once post-wave | Riskier: `--frozen-lockfile` CI fails mid-wave.                                                                       |

**Recommendation: wave-batched PRs.** The parallelism that matters is _across_ lanes: **PG-A ∥ PG-B ∥ PG-C** touch different lockfiles (`pnpm-lock.yaml` vs `Cargo.lock`) and never collide — genuinely 3-wide with zero contention. (Reconcile with `03-execution-phases.md` Phase 2 relocation, which batches pure moves per wave into one PR; both agree the lockfile is the serialization point — wave-batching is the parallel-agent-friendly relaxation of the single-pivot stance.)

---

## 5. Pure relocation vs config-touching (serialization classes)

| Class                                                                    | Definition                                                    | Members                                                                                                                                                    | Risk                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Class 1 — PURE relocation**                                            | imports are `@pops/*` by name; only `git mv` + `pnpm install` | all of R1 (TS lib moves); source-move bodies of R3 (mcp, orchestrator, docs, moltbot, shell dirs)                                                          | lowest; maximally parallel. exports are package-relative → unaffected |
| **Class 2 — drags a co-located path-literal** (per-unit, no shared file) | move + edit a file _inside_ the moved subtree                 | overlay-ego (R1-T09: depcruise path → put edit in **C-T01**, keep R1-T09 pure); moved-app Dockerfiles (R3-T01..05 → **C-T07**, per-Dockerfile so parallel) | low; still per-unit                                                   |
| **Class 3 — SHARED-CONFIG (strictly serialize per file)**                | files touched by _all_ moves; two PRs cannot edit at once     | see list below                                                                                                                                             | the serialization points                                              |

**Class 3 shared-config files:**

1. `pnpm-workspace.yaml` — G0 (add `libs/*`) + G1 (drop `apps/*`,`packages/*`). **Hard serial gates.**
2. `.dependency-cruiser.cjs` — C-T01 (overlay-ego path; ISO rule retargets; tombstones).
3. `infra/docker-compose.yml` + `.dev.yml` — C-T02 (orchestrator/mcp `dockerfile:` keys; moltbot bind-mounts; pillar lines unchanged).
4. `.github/workflows/publish-images.yml` — C-T05 (app matrix `file:` apps/_ → pillars/_).
5. `.github/workflows/fe-quality.yml` + `storybook-quality.yml` — C-T04 (dead `packages/app-*/**` globs; `packages/{ui,navigation,types,db-types,pillar-sdk}/**` → `libs/...`; storybook path).
6. per-pkg `*-quality.yml` `package-path:` (db-types, ai-telemetry, module-registry, pillar-settings, ui, navigation) — C-T03.
7. `orchestrator-quality.yml`, `module-registry-quality.yml` `paths:` — C-T06.
8. `crates/Cargo.toml` `members` + `Cargo.lock` — R2 (serial within rust lane).
9. root `package.json` (turbo scripts; `lint:boundaries` literal path list — unchanged by moves, only by depcruise scope) — Phase G.

**Immune (disk-discovery workflows — keep/extend, do not fight):** `pillar-quality.yml`, `pillar-schema-coverage.yml`, the pillar half of `publish-images.yml`. They `find pillars -mindepth 1 -maxdepth 1 -type d`; the 9 backend pillars **do not move** → **zero edits**. Phase G should extend the same `find libs ...` discovery to the lib + app-pillar lanes.

---

## 6. Conflict matrix — shared files × workstream

Rows = shared/serializing files. Columns = workstreams. ✗ = writes (mutual-exclusion required); · = no touch. Any file with ≥2 ✗ in the _same wave_ must serialize those tasks.

| Shared file                                                | G0/G1 gate                              | R1 TS-lib moves      | R2 rust moves | R3 app→pillar | R3-T06 storybook | C config-retarget                | G build-model       |
| ---------------------------------------------------------- | --------------------------------------- | -------------------- | ------------- | ------------- | ---------------- | -------------------------------- | ------------------- |
| `pnpm-workspace.yaml`                                      | ✗ (G0 add libs/, G1 drop apps,packages) | ·                    | ·             | ·             | ·                | ·                                | ·                   |
| `pnpm-lock.yaml`                                           | ·                                       | ✗ (all)              | ·             | ✗ (all)       | ✗                | ·                                | ✗ (script swap)     |
| `crates/Cargo.toml` + `Cargo.lock`                         | ·                                       | ·                    | ✗ (all R2)    | ·             | ·                | ·                                | ·                   |
| `.dependency-cruiser.cjs`                                  | ·                                       | ✗ overlay-ego only\* | ·             | ·             | ·                | ✗ C-T01                          | ·                   |
| `infra/docker-compose.yml` / `.dev.yml`                    | ·                                       | ·                    | ·             | ·†            | ·                | ✗ C-T02                          | ·                   |
| `.github/workflows/publish-images.yml`                     | ·                                       | ·                    | ·             | ·             | ·                | ✗ C-T05                          | maybe (matrix→disk) |
| `.github/workflows/fe-quality.yml`                         | ·                                       | ·                    | ·             | ·             | ·                | ✗ C-T04                          | ·                   |
| `.github/workflows/storybook-quality.yml`                  | ·                                       | ·                    | ·             | ·†            | ·                | ✗ C-T04                          | ·                   |
| per-pkg `*-quality.yml` (6)                                | ·                                       | ·                    | ·             | ·             | ·                | ✗ C-T03 (1 task/file → parallel) | ·                   |
| `orchestrator-quality.yml` / `module-registry-quality.yml` | ·                                       | ·                    | ·             | ·             | ·                | ✗ C-T06                          | ·                   |
| moved-app `Dockerfile` (×5, NOT shared)                    | ·                                       | ·                    | ·             | ✗ own only    | ·                | ✗ C-T07 own only                 | ·                   |
| root `package.json`                                        | ·                                       | ·                    | ·             | ·             | ·                | ·                                | ✗ G-T03/05/06       |
| root `tsconfig.json` (to be CREATED)                       | ·                                       | ·                    | ·             | ·             | ·                | ·                                | ✗ G-T01             |
| `turbo.json`                                               | ·                                       | ·                    | ·             | ·             | ·                | ·                                | ✗ G-T06             |

\* **Resolution:** move overlay-ego's depcruise edit **into C-T01**; keep R1-T09 a pure `git mv`. Removes the only intra-R1 shared-file conflict.
† **Drag, not direct write:** orchestrator/mcp `dockerfile:` keys and storybook globs are dragged by R3 moves but edited in Phase C (C-T02 / C-T04), keeping R3 source-only.

### Reading the matrix

- `pnpm-lock.yaml` is the only file co-written by R1 ∥ R3 ∥ storybook → the binding reason to **wave-batch** (one PR per lane). R2 writes `Cargo.lock` instead → rust lane is freely concurrent with the TS lanes.
- Every Phase-C task targets a **distinct file** → PG-E is genuinely 7-wide parallel, no intra-C serialization (the `*-quality.yml` per-file split is what makes C-T03 itself fan-out-safe).
- Phase G clusters on root `package.json`/`tsconfig`/`turbo.json` → mostly serial, smallest fan-out, sits at the critical-path tail.

---

## 7. Sequencing summary (executable shape)

| #   | Step                                                                                                                                             | Kind                             | Parallelism    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | -------------- |
| 1   | **P0** working-tree cleanup                                                                                                                      | single PR (green, done)          | —              |
| 2   | **G0** add `libs/*` to `pnpm-workspace.yaml`                                                                                                     | single serial PR                 | barrier        |
| 3   | **PG-A** (1 PR: 9 TS lib moves) ∥ **PG-B** (1 PR: 5 app→pillar + cli drop) ∥ **PG-C** (1 PR: rust); **PG-D** storybook fold after PG-A's ui move | 3 concurrent lanes + 1 follow-on | 3–4 wide       |
| 4   | **G1** drop `apps/*`,`packages/*` globs; delete empty dirs                                                                                       | single serial PR                 | barrier        |
| 5   | **PG-E** 7-wide config retarget (1 PR per shared file)                                                                                           | parallel                         | 7 wide         |
| 6   | **Phase G** build-model swap (tsc-b graph creation, mise.toml, de-turbo, CI disk-discovery)                                                      | critical-path tail               | partly serial  |
| 7   | **Phase RD** kill static registry (north-star) — `06-registry-decoupling.md`                                                                     | separate epic                    | unblocked here |

**Files of record (absolute):**

- `/Users/joao/dev/personal/pops/pnpm-workspace.yaml` (G0/G1 gates)
- `/Users/joao/dev/personal/pops/.dependency-cruiser.cjs` (C-T01)
- `/Users/joao/dev/personal/pops/crates/Cargo.toml` + `/Users/joao/dev/personal/pops/Cargo.lock` (R2)
- `/Users/joao/dev/personal/pops/infra/docker-compose.yml`, `/Users/joao/dev/personal/pops/infra/docker-compose.dev.yml` (C-T02)
- `/Users/joao/dev/personal/pops/.github/workflows/{publish-images,fe-quality,storybook-quality,pillar-quality,pillar-schema-coverage,orchestrator-quality,module-registry-quality,quality}.yml` (C-T03..06; pillar-quality + schema-coverage immune)
- `/Users/joao/dev/personal/pops/package.json`, `/Users/joao/dev/personal/pops/turbo.json` (Phase G)
- root `tsconfig.json` / `tsconfig.build.json` — **does not exist; CREATE in G-T01** (`02-build-system.md`)
