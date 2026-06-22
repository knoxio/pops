# 02 — Build System: turbo → mise

> Drop turbo. Replace its task graph with **mise** (uniform per-unit entrypoints + toolchains) +
> **`tsc -b` project references** (the `^build` ordering) + **pnpm** (install/workspace/subgraph
> filters) + **cargo** (single Rust workspace). NOT bazel; moonrepo is a future escape hatch only.

Repo root: `/Users/joao/dev/personal/pops`. Task IDs here use the `G-Tnn` analysis-family aliases (Phase G,
build model). **These are aliases for the canonical `P5-T*` tasks defined in `03-execution-phases.md`** —
resolve via the crosswalk in `00-architecture.md` §7.1: `G-T01`=`P5-T01`, `G-T02`=`P5-T02`, `G-T03`=`P5-T03`,
`G-T04`=`P5-T04`, `G-T05`+`G-T06`=`P5-T05`. Cross-referenced from `00-architecture.md`,
`03-execution-phases.md` (relocation + phase backlog), `04-isolation-enforcement.md`, `05-cicd-deployment.md`.

This phase is the **critical-path tail**: it depends on the _final_ directory shape (`pillars/` + `libs/`),
so it lands **after** the relocation barrier (`G1` in the move plan). See [§8 Sequencing](#8-sequencing--gates).

---

## 0. What turbo does today (the contract to reproduce)

`turbo.json` defines 7 tasks. The only thing that actually matters is **ordering** + **caching**.

| turbo task         | `dependsOn`    | outputs                           | persistent | semantics to preserve                                 |
| ------------------ | -------------- | --------------------------------- | ---------- | ----------------------------------------------------- |
| `build`            | `^build`       | `dist/**`, `.next/**`, `build/**` | no         | a unit builds only after **its workspace deps** built |
| `dev` / `dev:full` | `^build`       | — (cache:false)                   | **yes**    | deps built once, then watcher stays up                |
| `test`             | `build` (self) | —                                 | no         | unit's own build runs before its tests                |
| `test:coverage`    | `build` (self) | `coverage/**`                     | no         | same                                                  |
| `typecheck`        | `^build`       | —                                 | no         | deps' `.d.ts` exist before a unit typechecks          |
| `registry:build`   | `^build`       | `src/generated.ts`                | no         | the static manifest generator (module-registry)       |

**Critical facts the replacement honors:**

- **No project references exist today** (`grep references tsconfig.base.json` → none; no root `tsconfig.json`).
  turbo's `^build` is the **only** thing ordering `tsc` runs. Removing it without `tsc -b` makes a clean
  `tsc` in finance fail because `@pops/types` `dist/` is absent. **`tsc -b` project references is the
  structural replacement for `^build` — it is net-new authoring, not migration.**
- **Three build classes** (from `package.json` data):
  - **COMPILED libs** (`main`→`dist/`; emit `dist/` + `.d.ts`): `types`, `db-types`, `pillar-sdk`,
    `pillar-settings`, `ai-telemetry`, `module-registry`. **Two sub-shapes today** (verified against each
    `package.json`): `types` + `module-registry` build with `tsc -p tsconfig.build.json` (the build-tsconfig
    **already exists**); `db-types`, `pillar-sdk`, `pillar-settings`, `ai-telemetry` build with **plain `tsc`**
    and have **no `tsconfig.build.json`**. The `tsc -b` migration (§2 / G-T01) therefore **creates** that file
    for the latter four (and flips their `build` script), but only **edits** it for the former two.
  - **SOURCE libs / FE** (no `build` script; `main`→`src/index.ts`; tsconfig `noEmit` + `moduleResolution:
bundler` + `isolatedModules`): `ui`, `navigation`, `overlay-ego`, all `app-*`. Never emit dist; the
    consumer's vite bundles them from TS source.
  - **PILLAR backends** (`build` = `tsc && tsx generate-openapi && tsx generate-api-types`; emit `dist/`).
  - **SHELL / docs** (`build` = `tsc && vite build`).
- **contacts has no `package.json`** → invisible to pnpm/turbo; it lives only in the cargo workspace.
  Rust is already a separate lane.

The blast radius of dropping turbo is therefore **small**: turbo lives only in root `package.json` scripts
and the `mise.toml` `turbo run` wrappers. CI's heavy lifting (`pillar-quality`, `rust-quality`) is **already
turbo-free and disk-discovered** — only `module-registry-quality.yml` (`pnpm turbo run registry:build`) is the
lone CI turbo invocation (deleted with the lib, see `03`/`05`).

---

## 1. mise task model — per-unit `mise.toml` + root aggregate

### Principle (extraction litmus)

Each unit gets its own `mise.toml` with the **same five task names** (`build`, `test`, `typecheck`, `lint`,
`dev`). Task bodies are **unit-local commands with no knowledge of siblings** — that is what survives
extraction: copy the unit dir to a new repo and its `mise.toml` still runs. Cross-unit **ordering** lives at
the **root**, not in the unit, via `tsc -b` (TS) / cargo (Rust) / pnpm filters (install) — exactly the deps
that "change only where shared deps come from" on extraction.

mise _does_ support `depends`, but inter-unit `depends` would bake sibling paths into a unit's `mise.toml` and
break the litmus test. **Rule:** unit `mise.toml` tasks are self-contained; ordering is delegated to `tsc -b`
and the root build graph. Keep mise `depends` only for **intra-unit** sequencing (e.g. a pillar's openapi gen
after its `tsc`; a pillar's `test` after its own `build`).

### Per-unit templates

| Template       | Applies to                                                        | Has `build`?                  | Has `dev`?          |
| -------------- | ----------------------------------------------------------------- | ----------------------------- | ------------------- |
| compiled-lib   | `libs/{types,db-types,sdk,settings,ai-telemetry,module-registry}` | yes (`tsc -b`)                | `tsc -b --watch`    |
| source-lib     | `libs/{ui,navigation,overlay-ego}`, every `pillars/*/app`         | **no** (bundled by consumer)  | storybook only (ui) |
| pillar-backend | `pillars/{core,ai,cerebrum,finance,food,inventory,lists,media}`   | yes (`tsc -b` + codegen)      | `tsx watch`         |
| shell          | `pillars/shell`                                                   | yes (`tsc -b` + `vite build`) | `vite`              |
| rust           | `pillars/contacts`, `libs/{pops-ai,pops-settings}`                | yes (`cargo build`)           | `cargo watch`       |

**Compiled lib** — `libs/types/mise.toml` (survives extraction verbatim):

```toml
[tasks.build]
description = "Emit dist/ + .d.ts"
run = "tsc -b tsconfig.build.json"
sources = ["src/**/*.ts", "tsconfig.build.json", "package.json"]
outputs = ["dist/**"]

[tasks.typecheck]
run = "tsc --noEmit"

[tasks.test]
run = "vitest run"

[tasks.lint]
run = "oxlint src && oxfmt --check ."

[tasks.dev]
run = "tsc -b tsconfig.build.json --watch --preserveWatchOutput"
```

`sources`/`outputs` give mise its own up-to-date skip (turbo-cache equivalent); `tsc -b`'s `.tsbuildinfo`
does the real incrementality.

**Source lib / FE** — `libs/ui/mise.toml` (no build; never emits):

```toml
[tasks.typecheck]
run = "tsc --noEmit"

[tasks.test]
run = "vitest run"

[tasks.lint]
run = "oxlint src && oxfmt --check ."

# no [tasks.build] — bundled by the consumer (shell/storybook vite).
# storybook is the dev surface (folded in from apps/pops-storybook, see 01):
[tasks.storybook]
run = "storybook dev -p 6006"
```

`pillars/finance/app/mise.toml` = source-lib template (typecheck/test/lint only; bundled by shell).

**Pillar backend** — `pillars/finance/mise.toml`:

```toml
[tasks.build]
description = "tsc → openapi snapshot → typed client"
run = [
  "tsc -b",
  "tsx scripts/generate-openapi.ts",
  "tsx scripts/generate-api-types.ts",
]
sources  = ["src/**/*.ts", "scripts/**/*.ts", "tsconfig.json"]
outputs  = ["dist/**", "openapi/*.json", "src/**/api-types.generated.ts"]

[tasks.typecheck]
run = ["tsc --noEmit", "tsc --noEmit -p scripts/tsconfig.json"]

[tasks.test]
depends = ["build"]   # reproduces turbo test→build(self); INTRA-unit only, extraction-safe
run = "vitest run"

[tasks.lint]
run = "oxlint src && oxfmt --check ."

[tasks.dev]
run = "tsx watch --clear-screen=false src/api/server.ts"

[tasks.start]
run = "node dist/api/server.js"
```

**Shell pillar** — `pillars/shell/mise.toml`:

```toml
[tasks.build]
run = ["tsc -b", "vite build"]   # tsc -b drives compiled-lib deps' .d.ts; vite bundles source libs
outputs = ["dist/**"]

[tasks.dev]
run = "vite"

[tasks.typecheck]
run = "tsc --noEmit"

[tasks.test]
run = "vitest run"

[tasks."test:e2e"]
run = "playwright test"

[tasks.lint]
run = "oxlint src && oxfmt --check ."
```

**Rust pillar / lib** — `pillars/contacts/mise.toml` (cargo walks up to the workspace `Cargo.toml`; no sibling
paths in the unit):

```toml
[tasks.build]     = { run = "cargo build --all-targets" }
[tasks.test]      = { run = "cargo test" }
[tasks.lint]      = { run = "cargo clippy --all-targets --all-features -- -D warnings && cargo fmt --check" }
[tasks.typecheck] = { run = "cargo check --all-targets" }
[tasks.dev]       = { run = "cargo watch -x run" }
```

`libs/pops-ai/mise.toml` and `libs/pops-settings/mise.toml` are identical minus `dev` (libs don't run).

### Root aggregate — `mise.toml` (replaces all `turbo X` root scripts)

The root holds **graph-aware** orchestration; it is the one `mise.toml` that does NOT need to survive extraction.

```toml
[tools]
node = "24.5.0"          # local; CI pins 22 — see §6
pnpm = "10.32.1"
rust = "stable"

[tasks.install]      = { run = "pnpm install" }

# ^build for the WHOLE compiled TS graph in one ordered pass:
[tasks.build]        = { run = "tsc -b tsconfig.build.json" }            # see §2 root solution file
[tasks."build:rust"] = { run = "cargo build --workspace" }              # workspace Cargo.toml at repo root (see 01)
[tasks."build:all"]  = { depends = ["build", "build:rust"] }

# Disk-discovery fan-out wrapper (mise has NO `--all` flag — verified mise 2026.6.x: only
# -C/--cd, -j/--jobs, etc.). `run-all` discovers every unit dir from disk and runs <task> in each,
# skipping units whose mise.toml lacks that task. This is the SAME `find … -maxdepth 1` matrix CI
# uses in `_discover-units.yml` (05 §B):
[tasks.run-all]
usage = 'arg "<task>"'
run = '''
for d in $(find pillars libs -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/mise.toml' ';' -print | sort); do
  mise run -C "$d" "$usage_task" 2>/dev/null || true
done
'''

# Fan out per-unit tasks across disk-discovered units (replaces `turbo test` etc.):
[tasks.test]      = { run = "mise run run-all test" }
[tasks.typecheck] = { run = "tsc -b tsconfig.build.json --noEmit ; mise run run-all typecheck" }
[tasks.lint]            = { run = "oxlint --type-aware" }
[tasks."format:check"]  = { run = "oxfmt --check ." }
[tasks."lint:boundaries"] = { run = "depcruise --config .dependency-cruiser.cjs --ignore-known --output-type err pillars libs scripts" }

[tasks.dev]      = { run = "mise run build && mise run -j 99 run-all dev" }
[tasks.registry] = { run = "tsx libs/module-registry/scripts/build.ts" }   # until static-list killed (RD-2/RD-5 in 06)
```

`run-all` is the disk-driven matrix the CI already uses in `pillar-quality.yml` / `_discover-units.yml`
(05 §B): `find pillars libs -mindepth 1 -maxdepth 1 -type d` over units carrying a `mise.toml`. There is
**no `mise run --all` flag** — the fan-out is always this explicit `run-all` wrapper task (or the equivalent
`pnpm -r exec mise run <task>`); every root task that fans out (`test`, `typecheck`, `dev`) calls `run-all`,
never `--all`.

---

## 2. `tsc -b` project-reference graph (the structural heart)

Two graphs joined by one root solution file. **This graph does not exist today (D7); it is created here.**

### Compiled graph (gets `references` + emits dist)

Add `composite: true` + `references` to each compiled unit's `tsconfig.build.json`, wiring `references` along
the **compiled-lib edges only** (source libs/FE are NOT in this graph). **Two sub-cases per the §0 build-class
split — do not assume the file exists uniformly:**

- **EDIT existing** `tsconfig.build.json`: `types`, `module-registry` (already have one; just add
  `composite`/`references`).
- **CREATE new** `tsconfig.build.json` AND flip the `build` script: `db-types`, `pillar-sdk`,
  `pillar-settings`, `ai-telemetry` build with plain `tsc` today and ship **no** `tsconfig.build.json`. For
  each: author the composite build-tsconfig (below) **and** change the `package.json` `build` from `tsc` to
  `tsc -b tsconfig.build.json` (and `dev` to `tsc -b tsconfig.build.json --watch` where present).
- **Pillar backends** (`core,ai,cerebrum,finance,food,inventory,lists,media`): create
  `tsconfig.build.json` (split from the editor `tsconfig.json`) — none has a build-tsconfig today.

```
libs/types            (leaf)
libs/db-types         (leaf)
libs/sdk              (=pillar-sdk, leaf)
libs/settings         (=pillar-settings, leaf)
libs/ai-telemetry     (leaf)
libs/module-registry  -> types     (pillar imports being dissolved per 06/RD-1; refs stay types-only)
pillars/core      -> sdk, settings, types
pillars/ai        -> ai-telemetry, sdk, settings, types
pillars/cerebrum  -> ai-telemetry, sdk, settings, types
pillars/finance   -> ai-telemetry, sdk, settings, types
pillars/food      -> ai-telemetry, sdk, types
pillars/inventory -> sdk, settings, types
pillars/lists     -> sdk, types
pillars/media     -> sdk, settings, types
```

Per-unit: split each `tsconfig.json` into `tsconfig.json` (editor, `noEmit`) + `tsconfig.build.json` (emit +
composite + refs). Example `pillars/finance/tsconfig.build.json`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "scripts"],
  "references": [
    { "path": "../../libs/ai-telemetry" },
    { "path": "../../libs/sdk" },
    { "path": "../../libs/settings" },
    { "path": "../../libs/types" },
  ],
}
```

`composite: true` forces `declaration` + `.tsbuildinfo`. The relative `references` are the **only**
sibling-awareness in a unit's tsconfig — on extraction these lines change to point at the published
`@pops/types` `dist`. That is the accepted "change only where shared deps come from" carve-out.

> **Dir-name vs package-name:** dir is `libs/sdk`/`libs/settings`, npm name stays `@pops/pillar-sdk`/
> `@pops/pillar-settings` (no rename during the move — see 01). `references` use the **dir path**
> (`../../libs/sdk`), package imports use the **npm name** (`@pops/pillar-sdk`). Both correct.

### Root solution file — `tsconfig.build.json` (new, at repo root)

```jsonc
{
  "files": [],
  "references": [
    { "path": "libs/types" },
    { "path": "libs/db-types" },
    { "path": "libs/sdk" },
    { "path": "libs/settings" },
    { "path": "libs/ai-telemetry" },
    { "path": "libs/module-registry" },
    { "path": "pillars/core" },
    { "path": "pillars/ai" },
    { "path": "pillars/cerebrum" },
    { "path": "pillars/finance" },
    { "path": "pillars/food" },
    { "path": "pillars/inventory" },
    { "path": "pillars/lists" },
    { "path": "pillars/media" },
  ],
}
```

`tsc -b tsconfig.build.json` topologically builds the whole compiled graph in one process — **the literal
`^build` replacement**, and faster than turbo's per-package `tsc` spawns (one server pass, incremental
`.tsbuildinfo`).

### Source libs / FE stay bundler-built (no dist, no refs)

`ui`, `navigation`, `overlay-ego`, all `app-*`, and the `shell`'s own code are **NOT** in the reference graph
and **do not** get `composite`. They keep `noEmit: true` + `moduleResolution: bundler` (already the case),
resolve `@pops/ui` → `src/index.ts` via the `exports` map, and vite bundles the TS source. Their `typecheck`
is a standalone `tsc --noEmit` (reads dep `.ts` directly — no refs needed).

The **shell** is the one source consumer that triggers the compiled graph: its `build` (`tsc -b && vite build`)
needs the compiled libs it imports (`module-registry`, `sdk`, `types`) to have `.d.ts` first. Give shell a
`tsconfig.build.json` that is `noEmit` for shell's own code but `-b` with `references` to those compiled libs.

### overlay-ego placement is build-indifferent

It's a **source lib** (`-> types, ui`, no build script). Whether it lands at `libs/overlay-ego` (the
classify-as-lib decision in 01/06) or stays a cerebrum surface, build-wise it is a no-emit bundler-resolved
source lib: no references, no dist. The build system does not gate the placement decision.

---

## 3. Command equivalence — turbo X → mise/tsc Y

| turbo                                   | replacement                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `turbo build`                           | `mise run build` → `tsc -b tsconfig.build.json` (+ `mise run build:rust`)           |
| `turbo build --filter=@pops/finance`    | `tsc -b pillars/finance/tsconfig.build.json` (auto-builds refs)                     |
| `turbo build --filter=@pops/finance...` | same — `tsc -b` of finance pulls its `references` graph                             |
| `turbo typecheck`                       | `tsc -b tsconfig.build.json --noEmit` + `mise run run-all typecheck` (source units) |
| `turbo test`                            | `mise run test` (fan-out; each unit's `test` has intra-unit `depends=["build"]`)    |
| `turbo test --filter=@pops/finance`     | `mise run -C pillars/finance test`                                                  |
| `turbo dev`                             | `mise run dev` = `tsc -b` once, then `mise run -j N run-all dev` (persistent)       |
| `turbo dev --filter=@pops/shell`        | `mise run -C pillars/shell dev` (after root `mise run build`)                       |
| `turbo run registry:build`              | `mise run registry` (until static-list killed)                                      |
| `turbo dev:full`                        | collapses into root `mise run dev`                                                  |
| turbo cache hit                         | `.tsbuildinfo` (TS) + mise `sources/outputs` skip + native vitest/vite/cargo caches |
| `turbo run build --affected`            | `tsc -b` (inherently incremental) + `git diff`-derived `mise run -C <u>`            |

### Reproducing the four turbo semantics

| turbo semantic            | mise/tsc replacement                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build: ^build`           | `tsc -b tsconfig.build.json` topo-orders the compiled graph in one pass; per-unit `mise build` = `tsc -b` of that unit, which auto-builds its `references` first                                                    |
| `typecheck: ^build`       | compiled units → `tsc -b --noEmit` (builds dep `.d.ts` as needed); source units → plain `tsc --noEmit` (reads dep `src`). Root `typecheck` runs `tsc -b ... --noEmit` once then fans out source-unit `tsc --noEmit` |
| `test: build` (self)      | per-unit `[tasks.test] depends = ["build"]` (intra-unit `depends`, extraction-safe). Source/FE units have no build → no `depends`                                                                                   |
| `dev: ^build, persistent` | root `dev` = `mise run build` (one-shot deps via `tsc -b`) **then** `mise run -j N run-all dev` (each unit's persistent watcher, parallel). Per-unit `dev` is just the watcher — no `^build` baked in               |

---

## 4. cargo: keep the single workspace

**Keep one cargo workspace** (one `Cargo.lock`, one CI lane). Federation places `pops-ai`/`pops-settings` as
**libs** and `contacts` as a **pillar**, but workspace membership is orthogonal to the directory taxonomy
(members are relative paths). After the move (per 01, workspace root relocates to repo root `/Cargo.toml`):

```toml
members = ["pillars/contacts", "libs/pops-ai", "libs/pops-settings"]
```

- **Do NOT split into per-crate workspaces** — that creates N lockfiles + N CI lanes for zero isolation gain
  (cargo already isolates at the crate boundary).
- Per-unit Rust `mise.toml` (§1) wraps `cargo build -p <name>`; cargo resolves against the workspace root
  automatically (walks up to `Cargo.toml`). Unit task is self-contained **and** workspace-aware — no sibling
  paths in the unit.
- **Extraction litmus (Rust):** a member declares `dep = { workspace = true }`. On extraction, replace
  `workspace = true` with a pinned version and drop the member from the root `Cargo.toml` — same carve-out as
  the TS `references`. (Boundary/extraction enforcement: `cargo-deny` + `check-cargo-deps.mjs` per 03.)

---

## 5. Root `package.json` + existing `mise.toml` changes

### `package.json` script diffs

| current                                                           | becomes                                              | note                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `"dev": "turbo dev"`                                              | `"dev": "mise run dev"`                              | or drop; mise is the entrypoint                  |
| `"build": "turbo build"`                                          | `"build": "tsc -b tsconfig.build.json"`              | mise root `build` calls this                     |
| `"typecheck": "turbo typecheck"`                                  | `"typecheck": "tsc -b tsconfig.build.json --noEmit"` | + source-unit fan-out in mise                    |
| `"test": "turbo test"`                                            | `"test": "mise run test"`                            | mise fans out per-unit                           |
| `"test:coverage": "turbo test:coverage"`                          | `"test:coverage": "mise run test:coverage"`          |                                                  |
| `"registry:build"` (pnpm filter)                                  | unchanged, or → `mise run registry`                  | dies with static-list removal (06)               |
| `"lint:boundaries"` / `:baseline`                                 | retarget roots to `pillars libs scripts` (per 03)    | turbo-independent; folded into 03 not here       |
| `lint`, `lint:fix`, `format`, `format:check`, `ci:fix`, `prepare` | **unchanged**                                        | oxlint/oxfmt/depcruise already turbo-independent |
| devDep `"turbo": "^2.9.18"`                                       | **remove**                                           |                                                  |

pnpm stays the package manager + workspace resolver (install, symlinks, `--filter` subgraph installs). **mise
does not replace pnpm; it replaces turbo's task graph.**

### Existing `mise.toml` — rip out turbo

The current root `mise.toml` is full of `pnpm exec turbo run ...` wrappers (`dev:pillars`,
`typecheck:pillars`, `test:pillars`, `openapi:generate`, `dev`). Rewrite every `turbo run` body to
`mise run run-all <task>` fan-outs (§1) or `tsc -b` calls. The turbo-free tasks survive but their `dir` paths change
with the move:

| existing task                         | edit                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `dev:shell` (`dir = apps/pops-shell`) | `dir = pillars/shell`                                                        |
| `dev:mcp` (`dir = apps/pops-mcp`)     | `dir = pillars/mcp`                                                          |
| `dev:storybook`                       | retarget to `libs/ui` (storybook folded in)                                  |
| `cli` / `cli:build` (`apps/pops-cli`) | **delete** (cli dropped)                                                     |
| `clean` (references `.turbo/`)        | drop the `.turbo/` line                                                      |
| docker/redis/worktree tasks           | turbo-free; keep, fix any `apps/`→`pillars/` / `packages/`→`libs/` dir paths |

---

## 6. Caching / affected / toolchain pinning

**Incrementality (turbo cache → native):**

- **TS:** `tsc -b` `.tsbuildinfo` is primary — only changed projects + dependents rebuild. Git-ignore
  `*.tsbuildinfo`; in CI restore via `actions/cache` keyed on `pnpm-lock.yaml` + `tsconfig.*` hashes (mirrors
  `rust-quality.yml`'s pattern, already on the org allow-list).
- **mise `sources`/`outputs`:** per-task up-to-date skip for non-tsc tasks (openapi gen, vite build).
- **vitest / vite / cargo:** native caches (`node_modules/.vite`, cargo `target/`) via `actions/cache`.

**Affected / changed-only (turbo `--filter=...[HEAD^]` → disk discovery + path filters):**

- CI already does this: `pillar-quality.yml` discovers from `find pillars`; each workflow is `paths:`-filtered.
  Extend disk-discovery to libs (a `libs-quality.yml` / unified `unit-quality.yml` matrix per 05).
- Local "build only what changed": `tsc -b` is inherently affected-aware (skips up-to-date projects). Test
  selection: `git diff --name-only origin/main | derive units | mise run -C <u> test`. No turbo
  `--affected` needed.
- **Subgraph install** stays pnpm: `pnpm install --filter "@pops/<unit>..."` (already in `pillar-quality.yml`).

**Toolchain pinning (CI 22 / local 24) — DECIDED 2026-06-22:** `jdx/mise-action@v2` (latest safe) is the **sole** Node manager — **no `setup-node`**. CI pins `[tools] node = "22"` via a `MISE_ENV=ci` override; local `mise.toml` pins node 24 (per HARD CONSTRAINTS). pnpm@10, rust stable in both.

**CI step changes (detailed matrix lives in 05; build-relevant deltas here):** add `jdx/mise-action@v2`
before `mise run build`/`mise run test`; swap any `^build`-dependent step to `tsc -b` (compiled) or leave as
`tsc --noEmit` (source); remove `.turbo/` from any cache paths/`.gitignore`.

**moonrepo escape hatch:** slot only if (1) a cross-language TS↔Rust task DAG becomes real (e.g. a Rust pillar
must build before a TS consumer codegen), or (2) remote distributed caching across many agents outgrows
`.tsbuildinfo` + `actions/cache`. moon's `moon.yml` would _wrap_ the per-unit `mise.toml` commands (moon calls
mise tasks) — adoption is additive, moon sits **above** mise. Until then: mise + tsc -b + pnpm + cargo. No moon,
no bazel.

---

## 7. Tasks (executable, agent-ready)

> **Hard ordering rule (from the build-system analysis):** the `tsc -b` references / cargo member paths encode
> `libs/`+`pillars/` locations. Safest order: \*\*(G-T01) introduce `tsc -b` + composite + root solution file
> with CURRENT paths and prove green → (relocation barrier in 01 rewrites paths atomically) → (G-T02..06) mise
>
> - turbo removal on the final tree.\*\* Each green before the next (CI-never-fails).

### G-T01 — Create the `tsc -b` reference graph (pre-move, current paths)

| field          | value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scope          | Author the compiled-graph project references with **current** `packages/` + `pillars/` paths; prove a clean `tsc -b` reproduces turbo `^build` ordering. No mise, no turbo removal yet. **Note the two `tsconfig.build.json` sub-cases (§0/§2): `types` + `module-registry` already have the file → edit it; `db-types`, `pillar-sdk`, `pillar-settings`, `ai-telemetry` have plain `tsc` + NO file → create it AND flip their `package.json` `build` (`tsc`→`tsc -b tsconfig.build.json`, `dev`→`tsc -b … --watch`); all 8 pillar backends → create it.**                                                                                               |
| files          | new root `tsconfig.build.json`; **EDIT existing** `tsconfig.build.json` in `packages/{types,module-registry}`; **CREATE** `tsconfig.build.json` + flip `build`/`dev` scripts in `packages/{db-types,pillar-sdk,pillar-settings,ai-telemetry}/package.json`; **CREATE** `tsconfig.build.json` (split from editor `tsconfig.json`) in `pillars/{core,ai,cerebrum,finance,food,inventory,lists,media}`. Each compiled `tsconfig.build.json` gets `composite:true` + `declaration`/`declarationMap` + `references`. Split each into editor `tsconfig.json` (`noEmit`) if not already; add `tsconfig.build.json` to shell with refs to its compiled-lib deps. |
| depends-on     | P0 (working-tree cleanup, merged)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| parallel-group | PG-F (build model) — runs solo on root `tsconfig` files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| acceptance     | ☐ `rm -rf **/dist **/*.tsbuildinfo && pnpm exec tsc -b tsconfig.build.json` builds all compiled units, exit 0 ☐ a downstream pillar (`finance`) builds with `@pops/types` dist present ☐ no `composite` on source libs/FE ☐ `pnpm typecheck` still green ☐ no new dep-cruiser violations                                                                                                                                                                                                                                                                                                                                                                 |
| verify         | `rm -rf **/dist **/*.tsbuildinfo && pnpm exec tsc -b tsconfig.build.json && echo OK`; `pnpm exec tsc -b pillars/finance/tsconfig.build.json`; `pnpm lint:boundaries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| rollback       | `git revert` the PR; `tsconfig.build.json` files are additive, turbo still drives `^build` so revert is clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### G-T02 — Per-unit `mise.toml` (final tree)

| field          | value                                                                                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scope          | Add a `mise.toml` to every unit using the §1 templates (compiled-lib / source-lib / pillar-backend / shell / rust). Add root `[tools]` block. No turbo removal yet (mise + turbo coexist for one PR).                                                                                                       |
| files          | new `mise.toml` in each of: `libs/{types,db-types,sdk,settings,ai-telemetry,module-registry,ui,navigation,overlay-ego,pops-ai,pops-settings}`, `pillars/{core,ai,cerebrum,finance,food,inventory,lists,media,shell,mcp,orchestrator,docs,contacts}`, every `pillars/*/app`; edit root `mise.toml` `[tools]` |
| depends-on     | G-T01, relocation barrier (01 `G1` — final dirs exist)                                                                                                                                                                                                                                                      |
| parallel-group | PG-F (units are file-disjoint → fan-out-safe; one PR or per-unit)                                                                                                                                                                                                                                           |
| acceptance     | ☐ `mise run -C libs/types build` emits dist ☐ `mise run -C pillars/finance test` builds-then-tests ☐ `mise run -C libs/ui typecheck` green (no build task) ☐ `mise run -C pillars/contacts build` runs cargo ☐ every unit `mise.toml` is sibling-path-free (grep for `../`)                                 |
| verify         | `mise run -C libs/types build`; `mise run -C pillars/finance test`; `mise run -C pillars/contacts build`; `! grep -rl '\.\./' --include=mise.toml libs pillars \| grep -v '^./mise.toml'`                                                                                                                   |
| rollback       | `git rm` the per-unit `mise.toml` files; turbo scripts unchanged so build path unaffected                                                                                                                                                                                                                   |

### G-T03 — Swap root scripts + rewrite existing `mise.toml` turbo wrappers

| field          | value                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| scope          | Flip root `package.json` scripts to mise/`tsc -b`; rewrite every `turbo run` body in the existing root `mise.toml` to the `run-all` fan-out wrapper (§1) / `tsc -b`; fix surviving task `dir` paths to the new layout; drop `apps/pops-cli` tasks + `.turbo/` clean line. |
| files          | root `package.json` (scripts §5), root `mise.toml`                                                                                                                                                                                                                        |
| depends-on     | G-T02                                                                                                                                                                                                                                                                     |
| parallel-group | PG-F (serial: shares root `package.json`/`mise.toml` with G-T05/G-T06)                                                                                                                                                                                                    |
| acceptance     | ☐ `pnpm build` == `tsc -b tsconfig.build.json` exit 0 ☐ `pnpm test` fans out via mise ☐ `pnpm typecheck` green ☐ `pnpm dev` builds deps then starts watchers ☐ no `turbo run` string remains in `mise.toml` ☐ no `apps/`/`packages/` dir path remains in `mise.toml`      |
| verify         | `pnpm build && pnpm typecheck && pnpm test`; `! grep -rn 'turbo run' mise.toml`; `! grep -rnE 'apps/                                                                                                                                                                      | packages/' mise.toml` |
| rollback       | `git revert`; turbo dep still present until G-T06, so reverting scripts restores turbo path                                                                                                                                                                               |

### G-T04 — CI: mise + tsc -b + disk-discovery for libs

| field          | value                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| scope          | Add `jdx/mise-action@v2` to CI; swap `^build`-dependent build steps to `tsc -b`; extend disk-discovery (`find pillars libs`) so libs get the same matrix as pillars. (Workflow-by-workflow edits owned by 05; this task lands the build-command swap.) |
| files          | `.github/workflows/{quality,pillar-quality,unit-quality(new per 05)}.yml`; remove `.turbo/` from cache paths anywhere referenced                                                                                                                       |
| depends-on     | G-T03                                                                                                                                                                                                                                                  |
| parallel-group | PG-F (after G-T03)                                                                                                                                                                                                                                     |
| acceptance     | ☐ CI green on a no-op PR ☐ a libs-only change triggers the lib matrix leg ☐ a pillar-only change still triggers pillar leg ☐ `tsc -b` runs in CI build step ☐ node pinned to 22 in CI                                                                  |
| verify         | local mirror: `mise run build && mise run typecheck && mise run test && pnpm lint && pnpm format:check && pnpm lint:boundaries`; push branch, `gh run watch`                                                                                           |
| rollback       | `git revert`; previous turbo-free CI steps restored                                                                                                                                                                                                    |

### G-T05 — `registry:build` de-turbo

| field          | value                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scope          | Replace `pnpm turbo run registry:build` (the lone CI turbo invocation, in `module-registry-quality.yml`) with `mise run registry` / direct `tsx`. Coupled with module-registry dissolution (06/RD-2,RD-5); until then it's a plain mise task. |
| files          | root `mise.toml` (`registry` task — already added G-T01/02 root block), `.github/workflows/module-registry-quality.yml` (or its deletion per 05)                                                                                              |
| depends-on     | G-T03                                                                                                                                                                                                                                         |
| parallel-group | PG-F                                                                                                                                                                                                                                          |
| acceptance     | ☐ `mise run registry` regenerates `src/generated.ts` identically ☐ `git diff --exit-code libs/module-registry/src/generated.ts` after run ☐ no `turbo` string in any workflow                                                                 |
| verify         | `mise run registry && git diff --exit-code libs/module-registry/src/generated.ts`; `! grep -rn 'turbo' .github/workflows/`                                                                                                                    |
| rollback       | `git revert`; restores `turbo run registry:build` step                                                                                                                                                                                        |

### G-T06 — Remove turbo (the cutover)

| field          | value                                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scope          | Delete `turbo.json`; remove the `turbo` devDependency; `pnpm install` to drop it from the lockfile. Final state: zero turbo.                                                                                                                                |
| files          | delete `turbo.json`; edit root `package.json` (remove `"turbo"` devDep); `pnpm-lock.yaml` (regenerated)                                                                                                                                                     |
| depends-on     | G-T03, G-T04, G-T05 (all turbo references gone first)                                                                                                                                                                                                       |
| parallel-group | PG-F (critical-path tail, last)                                                                                                                                                                                                                             |
| acceptance     | ☐ `grep -rn turbo` over repo returns only docs/plan references ☐ `pnpm build/test/typecheck/dev` all work without turbo installed ☐ full local CI gate green ☐ `pnpm install --frozen-lockfile` clean                                                       |
| verify         | `! grep -rnE '\bturbo\b' package.json mise.toml .github/workflows turbo.json 2>/dev/null`; `rm -rf node_modules && pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test`; cargo: `cargo build --workspace && cargo test --workspace` |
| rollback       | `git revert` G-T06; `pnpm install` restores turbo; G-T01..05 leave the build dual-runnable so revert is safe                                                                                                                                                |

---

## 8. Sequencing & gates

```
P0 (cleanup, merged)
 └─ G-T01  tsc -b graph @ CURRENT paths  ─────────────┐  (turbo still drives ^build; dual-runnable)
                                                       │
        [ relocation barrier: 01/G1 — packages/→libs/, apps/→pillars/, crates→root;
          atomically rewrites tsconfig.build.json references + Cargo members to new paths ]
                                                       │
 └─ G-T02  per-unit mise.toml @ FINAL tree  ──────────┤  (mise + turbo coexist)
 └─ G-T03  root scripts + mise.toml de-turbo  ────────┤
 └─ G-T04  CI mise + tsc -b + lib discovery  ─────────┤
 └─ G-T05  registry:build de-turbo  ──────────────────┤
 └─ G-T06  delete turbo.json + devDep  ───────────────┘  (zero turbo)
```

**Why dual-runnable matters:** G-T01 adds `tsc -b` _alongside_ turbo; G-T02/03 add mise _alongside_ turbo;
turbo is only removed at G-T06. At every PR the tree builds via **both** the old and new path, so CI never has
a window where neither works (HARD CONSTRAINT: CI never fails).

**The relocation barrier (01/G1) sits between G-T01 and G-T02** because the `references` and cargo `members`
paths encode `libs/`+`pillars/` — they must be rewritten in the same atomic move PR, not piecemeal.

**Local gate before every push (per task verify, plus the global mirror):**

```bash
pnpm lint && pnpm format:check && pnpm lint:boundaries && pnpm typecheck && pnpm test
cargo build --workspace && cargo test --workspace   # when rust touched
```

---

## 9. Files of record (absolute)

| path                                                                                                                                                                                                                                                                       | phase task                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/Users/joao/dev/personal/pops/turbo.json`                                                                                                                                                                                                                                 | delete — G-T06                                                                      |
| `/Users/joao/dev/personal/pops/package.json`                                                                                                                                                                                                                               | scripts + remove turbo devDep — G-T03, G-T06                                        |
| `/Users/joao/dev/personal/pops/mise.toml`                                                                                                                                                                                                                                  | rewrite turbo wrappers, add aggregates, fix dirs — G-T03                            |
| `/Users/joao/dev/personal/pops/tsconfig.build.json`                                                                                                                                                                                                                        | NEW root solution file — G-T01                                                      |
| `tsconfig.build.json` — EDIT existing (`libs/{types,module-registry}`); CREATE new + flip `build` script (`libs/{db-types,sdk,settings,ai-telemetry}`); CREATE new (`pillars/{core,ai,cerebrum,finance,food,inventory,lists,media}`). Each gets `composite` + `references` | G-T01                                                                               |
| each unit `mise.toml` (all `pillars/*`, `libs/*`, `pillars/*/app`)                                                                                                                                                                                                         | NEW — G-T02                                                                         |
| `/Users/joao/dev/personal/pops/Cargo.toml` (relocated from `crates/Cargo.toml` per 01)                                                                                                                                                                                     | member paths `pillars/contacts`, `libs/pops-ai`, `libs/pops-settings`               |
| `.github/workflows/{pillar-quality,quality,unit-quality,module-registry-quality}.yml`                                                                                                                                                                                      | add mise-action, swap to `tsc -b`, lib discovery — G-T04, G-T05 (full matrix in 05) |
