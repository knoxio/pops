# 00 — Architecture (the conceptual anchor)

> **Status:** LOCKED. This file is the single source of truth for _definitions_,
> the _isolation rule_, the _target layout_, and the _glossary_. Every other file
> in `docs/plans/repo-federation/` refers back to the task IDs, taxonomy, and
> terms defined here. If another file contradicts this one, this one wins —
> open a PR against this file to change a locked decision, do not fork it.

- **Repo:** `/Users/joao/dev/personal/pops`
- **Base branch / commit:** `main` @ `fb56d4d0`
- **Goal of the federation:** reorganize a type-first monorepo (`apps/`, `packages/`, `crates/`, `services/`) into a **provider-first federation** of two unit kinds — **PILLAR** and **LIB** — under `pillars/` + `libs/`, and replace turbo with a mise-based polyglot build model.
- **North-star (out of scope of the move, unblocked by it):** runtime LAN self-registration is the sole source of which pillars exist; the static `POPS_PILLARS` list and the `module-registry` static manifest are dissolved. ~70% of this already exists on `main` (see `06`).

---

## 1. The two-kind taxonomy (verbatim — do not paraphrase in other files)

There are exactly **two kinds of unit** in this repo. Every directory under `pillars/` or `libs/` is one or the other. There is no third kind.

### PILLAR

> **PILLAR = "whatever registers and joins the OS/network."** A deployable,
> self-registering capability provider with a contract. Its internals are
> opaque. It is consumed **ONLY** via its published contract — either at
> **runtime** (REST + discovery/registration) or at **build time** (a published
> artifact such as a contract package or a manifest export). Nobody reaches
> behind a pillar's contract.

Operationally, a unit is a PILLAR if it:

- is **deployable** (has a `Dockerfile` and/or a runnable process), **or**
- **self-registers** with the OS (POSTs register/heartbeat/deregister to core's `/registry/*`, TS via `@pops/pillar-sdk` `bootstrap/register`, Rust via `registry/lifecycle.rs`), **or**
- publishes a **contract** other units consume (REST contract package like `@pops/finance`, or a `./manifest` export).

A pillar's frontend (`pillars/<x>/app`) is part of the pillar — it ships in the same unit directory and is the pillar's UI surface.

### LIB

> **LIB = "any code that facilitates pillars existing."** Package-shaped.
> Local now but **always extractable to its own publishable repo**.
> Language-agnostic. Consumed by _import of its published surface_, never over a
> network contract.

Operationally, a unit is a LIB if it:

- is **not** deployable and does **not** self-register, **and**
- exists to be **imported** by pillars (or other libs) as a package, **and**
- could be `npm publish`/`cargo publish`'d and consumed from a registry with no behavioral change.

### The one-line discriminator

| Question                           | PILLAR                                                           | LIB                                 |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Registers / joins the network?     | **yes**                                                          | no                                  |
| Deployable (Dockerfile/process)?   | yes (incl. `@pops/docs`, `@pops/mcp`)                            | no                                  |
| Consumed via…                      | a **contract** (runtime REST + discovery, or published artifact) | **import** of its published surface |
| Owns its internals as a black box? | yes                                                              | yes (its non-`exports` files)       |

---

## 2. The contract-seam isolation rule

> **Isolation rule:** Consume **ACROSS** contracts freely — a unit may depend on
> another unit's _published_ lib/types/contract. **NEVER reach behind a contract**
> into another unit's internals.

Mechanically, "the contract" of a unit is exactly:

- **TS:** the set of paths reachable through its `package.json#exports` map (gated by the `"files"` whitelist for compiled units).
- **Rust:** the `pub` surface of its crate root.

Anything **not** reachable from `exports` / not `pub` is _internal_ and is a **behind-the-contract reach** if imported from another unit.

### The four invariants (enforced in CI — see `07`/`05`)

| ID         | Invariant                                                                                                                                                                                                                     | Canonical violation today                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **ISO-R1** | A **lib must never import a pillar** (neither `pillars/**` by path nor `@pops/<pillar>` by name). Dependency inversion = un-extractable.                                                                                      | `module-registry` (a lib) pins all 8 pillars; see `06`.          |
| **ISO-R2** | A **pillar consumes another pillar ONLY via its published contract** (`@pops/<other>`, resolved through that pillar's `exports`). Filesystem-path cross-pillar imports (`pillars/<other>/src\|app\|db`) are always forbidden. | the old `no-cross-app-import` rule, now generalized to backends. |
| **ISO-R3** | **No deep import past any `exports` map** (`@pops/<x>/src/...`, `@pops/<x>/dist/internal/...`). Consume only declared subpaths.                                                                                               | —                                                                |
| **ISO-R4** | **Leaf libs stay leaf** + the whole graph is **acyclic**. A cycle means neither end can be extracted.                                                                                                                         | —                                                                |

These are dep-cruiser rules + exports/`files` discipline + a sandbox extraction proof. The `@pops/<pillar>` list inside ISO-R1 is **generated from disk**, never hand-maintained (kills the "static-list rot" failure mode at the lint layer too).

---

## 3. The extract-to-own-repo litmus test (apply to EVERY unit)

> **Litmus test:** "Could this unit be extracted to its own repo and still
> **build / deploy / self-register**, changing **only where its shared deps come
> from**?"

The _only_ sanctioned change on extraction is **where shared deps resolve from**:

| Lang                     | In-workspace form                                            | On extraction becomes                                           | What must NOT change                                         |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| TS lib/pillar            | `"@pops/x": "workspace:*"` + pnpm symlink                    | `"@pops/x": "^1.2.3"` from a registry                           | source, `exports`, build command, the rest of `package.json` |
| TS `tsconfig.build.json` | `references: [{ path: "../../libs/types" }]`                 | drop the ref; resolve `@pops/types` `.d.ts` from `node_modules` | the unit's own compiler options                              |
| Rust                     | `dep = { workspace = true }` + member of `crates/Cargo.toml` | pinned `dep = "1.2.3"`; drop from `members`                     | the crate's source + `pub` surface                           |

If extraction would force changing the unit's **source**, its **public surface**, or its **build/run command**, it **fails** the litmus test — that is a behind-the-contract reach (ISO-R1/R2/R3) or a hidden coupling. The CI sandbox check (`07`, EX-2/cargo-sandbox) mechanizes this: copy the unit out, repoint shared deps to packed tarballs/pinned versions, and prove it still builds. A unit that secretly reached behind a contract fails because the reached file was never in the packed `dist` / never `pub`.

This litmus test is the **acceptance bar for every classification** in §4 and every task in this plan.

---

## 4. Target root layout + full unit assignment

```
/Users/joao/dev/personal/pops
├── pillars/          # every unit that registers/joins the network
│   ├── core            ai            cerebrum      contacts(rust)
│   ├── finance         food          inventory     lists          media
│   ├── shell           mcp           docs          orchestrator   moltbot
│   └── (kiosk — later)
│   #   each node pillar: src/{api,contract,db} + app/ (frontend) + migrations + openapi + Dockerfile
│   #   contacts: Rust crate (src/, Cargo.toml) + app/ (frontend)
├── libs/             # every unit that facilitates pillars existing
│   ├── sdk(=@pops/pillar-sdk)    settings(=@pops/pillar-settings)
│   ├── module-registry          types          db-types
│   ├── ui                       navigation     ai-telemetry
│   ├── pops-ai(rust)            pops-settings(rust)
│   └── ego-ui (overlay-ego — classification LOCKED = LIB; placement detail in 06)
├── scripts/ (or ci/) # thin repo-meta tooling: check-pillar-schema-coverage.mjs,
│                      #   isolation/extractability checks, agent-review, discovery helpers
├── infra/            # docker-compose, deploy substrate (unchanged home)
├── docs/             # plans, ADRs (this file lives here)
├── Cargo.toml + Cargo.lock   # cargo workspace root relocates here from crates/
├── pnpm-workspace.yaml       # globs: pillars/* , pillars/*/* , libs/*
├── tsconfig.base.json        # path-less today; tsconfig.build.json solution file added in build phase
└── (apps/ packages/ crates/ services/  — DISSOLVED)
```

### 4.1 Full assignment of every current unit to its new home

`@pops/cli` is **dropped**. `@pops/storybook` **folds** into `libs/ui` as a dev surface. npm package names are **kept unchanged** during the move (dir name ≠ package name is fine; renaming is separate optional churn — see `02`/`03`).

#### Already under `pillars/` — NO MOVE (9 backends + their frontends + contacts)

| Unit               | npm name          | path (now & target) | kind               |
| ------------------ | ----------------- | ------------------- | ------------------ |
| core BE            | `@pops/core`      | `pillars/core`      | PILLAR             |
| ai BE              | `@pops/ai`        | `pillars/ai`        | PILLAR             |
| cerebrum BE        | `@pops/cerebrum`  | `pillars/cerebrum`  | PILLAR             |
| finance BE         | `@pops/finance`   | `pillars/finance`   | PILLAR             |
| food BE            | `@pops/food`      | `pillars/food`      | PILLAR             |
| inventory BE       | `@pops/inventory` | `pillars/inventory` | PILLAR             |
| lists BE           | `@pops/lists`     | `pillars/lists`     | PILLAR             |
| media BE           | `@pops/media`     | `pillars/media`     | PILLAR             |
| contacts (rust)    | crate `contacts`  | `pillars/contacts`  | PILLAR             |
| app-ai … app-media | `@pops/app-*`     | `pillars/<x>/app`   | part of its PILLAR |

#### LIBS — `packages/*` → `libs/*` (8 moves)

| Unit            | npm name (unchanged)    | move                                                | kind | why LIB                                               |
| --------------- | ----------------------- | --------------------------------------------------- | ---- | ----------------------------------------------------- |
| pillar-sdk      | `@pops/pillar-sdk`      | `packages/pillar-sdk` → `libs/sdk`                  | LIB  | imported registration/contract toolkit; leaf          |
| pillar-settings | `@pops/pillar-settings` | `packages/pillar-settings` → `libs/settings`        | LIB  | imported settings toolkit; leaf                       |
| types           | `@pops/types`           | `packages/types` → `libs/types`                     | LIB  | shared types; leaf                                    |
| db-types        | `@pops/db-types`        | `packages/db-types` → `libs/db-types`               | LIB  | shared db types; leaf                                 |
| ai-telemetry    | `@pops/ai-telemetry`    | `packages/ai-telemetry` → `libs/ai-telemetry`       | LIB  | imported telemetry wrapper; leaf                      |
| ui              | `@pops/ui`              | `packages/ui` → `libs/ui`                           | LIB  | component library (source lib)                        |
| navigation      | `@pops/navigation`      | `packages/navigation` → `libs/navigation`           | LIB  | nav helpers (source lib)                              |
| module-registry | `@pops/module-registry` | `packages/module-registry` → `libs/module-registry` | LIB  | manifest **validator** (de-pillared in `06`); HOTSPOT |

#### PILLARS — `apps/*` → `pillars/*` (5 moves) + 1 drop + 1 fold

| Unit         | npm name (unchanged) | action                                            | kind         | why                                                                                                                   |
| ------------ | -------------------- | ------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| shell        | `@pops/shell`        | `apps/pops-shell` → `pillars/shell`               | PILLAR (web) | process self-registers as the web pillar; browser/kiosk is its client (BFF skipped — Tailscale flattens remote→local) |
| mcp          | `@pops/mcp`          | `apps/pops-mcp` → `pillars/mcp`                   | PILLAR       | deployable; MCP is the interaction layer                                                                              |
| orchestrator | `@pops/orchestrator` | `apps/pops-orchestrator` → `pillars/orchestrator` | PILLAR       | deployable process                                                                                                    |
| docs         | `@pops/docs`         | `apps/pops-docs` → `pillars/docs`                 | PILLAR       | deployable doc site                                                                                                   |
| moltbot      | (config-only)        | `apps/moltbot` → `pillars/moltbot`                | PILLAR       | config/skills provider                                                                                                |
| storybook    | `@pops/storybook`    | **FOLD** into `libs/ui` dev surface               | (gone)       | storybook is `ui`'s dev surface; consume `app-*` as devDep only, never re-export                                      |
| cli          | `@pops/cli`          | **DROP** (`git rm -r apps/pops-cli`)              | (gone)       | MCP is the interaction layer                                                                                          |

#### RUST — `crates/*` → `libs/*`; workspace root → repo root

| Unit                 | move                                                                                                                   | kind                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| pops-ai              | `crates/pops-ai` → `libs/pops-ai`                                                                                      | LIB                    |
| pops-settings        | `crates/pops-settings` → `libs/pops-settings`                                                                          | LIB                    |
| cargo workspace root | `crates/Cargo.toml` + `Cargo.lock` → repo root; `members = ["pillars/contacts", "libs/pops-ai", "libs/pops-settings"]` | repo-meta (not a unit) |

After all moves, `apps/`, `packages/`, `crates/`, `services/` are empty and removed.

#### overlay-ego — classification LOCKED, placement detail in `06`

| Aspect                      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current                     | `pillars/cerebrum/overlay-ego`, `@pops/overlay-ego` → `@pops/types`, `@pops/ui`; consumed by **shell** + **app-cerebrum**                                                                                                                                                                                                                                                                                                                                           |
| Kind                        | **LIB** (locked). Frontend-only React surface + generated client for a _remote_ Ego service; no backend, no self-registration, consumed by import not contract. Consumed across two units ⇒ cannot live inside cerebrum as an internal.                                                                                                                                                                                                                             |
| Why not a cerebrum contract | contracts are for runtime REST + manifests, not React components; routing it through cerebrum's contract would force shell→cerebrum and pollute the contract with FE concerns.                                                                                                                                                                                                                                                                                      |
| Target path                 | The relocation (`P2-T01`) lands it at **`libs/overlay-ego`** (pure `git mv`, npm name `@pops/overlay-ego` unchanged). The eventual `→libs/ego-ui` rename (to separate "the ego overlay UI" from "ego the capability") is **deferred** to a later standalone PR to avoid mid-migration churn — **the placement/rename mechanics are owned by `06`**, the _classification_ (LIB) is locked here. Until that rename lands, every path reference is `libs/overlay-ego`. |

---

## 5. Build model (locked) — what replaces turbo

> **DROP turbo.** Use **mise** (toolchains + uniform per-unit task entrypoints,
> per-unit `mise.toml`) + native per-unit builds + **`tsc -b`** for shared TS
> build ordering + **pnpm** for install/workspace + **cargo** per-unit + a CI
> matrix that **discovers units from disk** and builds only changed.
> **NOT bazel. moonrepo only as a future escape hatch.**

| Concern                                                                  | Mechanism                                                                                                     | Detail file |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------- |
| Toolchain + uniform task names (`build`/`test`/`typecheck`/`lint`/`dev`) | per-unit `mise.toml` (self-contained, survives extraction)                                                    | `04`        |
| TS build ordering (the `^build` replacement)                             | `tsc -b` project references + a root `tsconfig.build.json` solution file (does **not** exist today — net-new) | `04`        |
| install / workspace symlinks / subgraph filter                           | pnpm@10 workspace (`--filter "@pops/x..."`)                                                                   | `04`        |
| Rust                                                                     | single cargo workspace, one `Cargo.lock`, one lane                                                            | `04`        |
| Affected / changed-only                                                  | `tsc -b` incrementality + disk-discovery CI matrix + `git diff`                                               | `04`/`05`   |
| Caching                                                                  | `.tsbuildinfo` + mise `sources`/`outputs` + `actions/cache` (no turbo cache)                                  | `04`        |

The build phase is intrinsically **last** (it encodes the _final_ directory shape) and intrinsically partly **serial** (root `tsconfig.build.json` → de-turbo scripts → remove turbo → CI). Sequencing across phases is owned by `01`.

---

## 6. Principles (bake into every task)

| #    | Principle                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1  | **CI must NEVER fail.** Every phase/PR is green before the next. Run the full gate locally before commit: `pnpm lint`, `pnpm format:check`, `pnpm lint:boundaries`, `pnpm typecheck`, `pnpm test`; `rust-quality` for Rust. |
| P-2  | **No type-safety hacks.** No `as any`, no `as unknown as T`, no `eslint-disable`/`ts-ignore`/suppressions. Fix the root cause.                                                                                              |
| P-3  | **oxlint + oxfmt** (NOT eslint/prettier). pnpm@10 + node 22 in CI / 24 local via mise. husky + lint-staged pre-commit.                                                                                                      |
| P-4  | **PRs branch off `main`; never push to `main` directly** (ruleset requires PR). Squash + linear history.                                                                                                                    |
| P-5  | **No Claude reference** anywhere pushed (commits, PR bodies, co-authors).                                                                                                                                                   |
| P-6  | **DRY**; no orphan TODOs (file an issue + reference it, or don't write it); comments only for non-obvious _why_.                                                                                                            |
| P-7  | **Names are the contract handle, paths are just disk.** Do **not** rename npm packages during the move (decoupled; renames are separate optional PRs).                                                                      |
| P-8  | **Discover from disk, not from a static list.** The `pillar-quality`/`schema-coverage`/`publish-images` matrices already do this — keep and extend to `libs/`.                                                              |
| P-9  | **Agent-executable.** Each task is one PR-sized, self-contained unit in its own git worktree, with explicit _depends-on_, _parallel-group_, _acceptance criteria_, _verify commands_, _rollback_.                           |
| P-10 | **The lockfile is the serialization point.** Parallel PRs collide on `pnpm-lock.yaml`; wave-batch moves per lane (TS-libs / app-pillars / rust touch different lockfiles → 3-wide with zero contention).                    |
| P-11 | **Litmus test on every unit** (§3) — it is the acceptance bar for every classification and extraction.                                                                                                                      |
| P-12 | **Images publish to `ghcr.io/knoxio`.** Deploy substrate is Watchtower (rolling restart, label-gated). Deploy gate = the live registry snapshot, not a static list.                                                         |

---

## 7. Phase map + canonical task-ID scheme + crosswalk (cross-reference index)

> **CANONICAL scheme = `P<phase>-T<nn>` (e.g. `P5-T01`), defined in `03-execution-phases.md`.**
> That file is the only one with full executable task definitions, and it is what an
> executing agent runs against. Every `depends-on` / owner-task citation resolves to a
> `P*-T*` heading in `03`.

The analysis docs (`01-dependency-dag.md`, `02-build-system.md`, `04-isolation-enforcement.md`,
`06-registry-decoupling.md`, `07-risks.md`) were authored in **analysis-family** ID schemes
(`R*` relocation, `G-T*` build, `C-T*` config, `RD-*` registry-decouple, `ISO-*`/`EX-*`/`RUST-*`
isolation, `P-ci-*`/`P-deploy-*`/`P-e2e-*` CI-deploy). These are **aliases** for the canonical
`P*-T*` tasks, not separate work. **When a file cites an analysis ID, resolve it to its canonical
`P*-T*` task via the crosswalk below, then read the definition in `03`.** (`05-cicd-deployment.md`'s
`P-ci-*`/`P-deploy-*`/`P-e2e-*` family is canonical _within_ `05` — those tasks are defined there,
not in `03` — and is listed in the crosswalk for completeness.)

### 7.1 Canonical ↔ alias crosswalk (every `depends-on` token resolves here)

| Canonical (`03`) | Alias(es) in analysis docs                                                                                                                                                  | Work                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **P0-T01**       | `P0` (cleanup)                                                                                                                                                              | staged dead-code + boundary cleanup                                 |
| **P0-T02**       | —                                                                                                                                                                           | drop `turbo.json` globs from non-build workflows                    |
| **P1-T01**       | `G0`                                                                                                                                                                        | add `libs/*` to `pnpm-workspace.yaml` (open gate)                   |
| **P2-T01**       | `R1-T01..R1-T09` (incl. overlay-ego `R1-T09`)                                                                                                                               | move all 9 TS libs `packages/*`→`libs/*` (1 PR)                     |
| **P2-T02**       | `R3-T01..R3-T05`, `R3-T07`                                                                                                                                                  | move apps→`pillars/*` + drop cli (1 PR)                             |
| **P2-T03**       | `R2-T01..R2-T03`                                                                                                                                                            | move rust libs `crates/*`→`libs/*` + relocate workspace root (1 PR) |
| **P2-T04**       | `R3-T06`                                                                                                                                                                    | fold storybook into `libs/ui` dev surface                           |
| **P3-T01**       | `G1`                                                                                                                                                                        | strip `apps/*`,`packages/*` globs; rm empty dirs (close gate)       |
| **P4-T01**       | `C-T01`                                                                                                                                                                     | dep-cruiser scope retarget + re-baseline                            |
| **P4-T02**       | `C-T02`                                                                                                                                                                     | docker-compose dockerfile paths + moltbot mounts                    |
| **P4-T03**       | `C-T03`                                                                                                                                                                     | per-lib `*-quality.yml` path globs                                  |
| **P4-T04**       | `C-T04`                                                                                                                                                                     | fe-quality + storybook-quality globs                                |
| **P4-T05**       | `C-T05`                                                                                                                                                                     | publish-images + docker-build paths                                 |
| **P4-T06**       | `C-T06`                                                                                                                                                                     | orchestrator/module-registry/rust/pillar quality paths              |
| **P4-T07**       | `C-T07`                                                                                                                                                                     | per-Dockerfile COPY-path retarget                                   |
| **P5-T01**       | `G-T01`                                                                                                                                                                     | create `tsc -b` project-reference graph                             |
| **P5-T02**       | `G-T02`                                                                                                                                                                     | per-unit `mise.toml`                                                |
| **P5-T03**       | `G-T03`                                                                                                                                                                     | root `mise.toml` + `package.json` script de-turbo                   |
| **P5-T04**       | `G-T04`                                                                                                                                                                     | CI disk-discovery (`_discover-units` + `unit-quality`)              |
| **P5-T05**       | `G-T05` (registry de-turbo) **+** `G-T06` (remove turbo)                                                                                                                    | delete turbo.json + devDep + last CI turbo invocation               |
| **P6-T01**       | `ISO-R1..R4`                                                                                                                                                                | dep-cruiser structural rules                                        |
| **P6-T02**       | `ISO-EXPORTS`, `ISO-SCOPE`, `RD-2` (export-tighten half)                                                                                                                    | exports/`files` normalize + `check-exports.mjs`                     |
| **P6-T03**       | `EX-1`, `EX-2`, `EX-3`, `ISO-CMD`                                                                                                                                           | extractability checks + `isolation:check`                           |
| **P6-T04**       | `RUST-1`, `RUST-2`, `RUST-3`                                                                                                                                                | cargo-deny + crate-dep checks                                       |
| **P6-T05**       | `P-ci-T-review` (agent-review guards)                                                                                                                                       | contract-isolation + lib-no-pillar guards + LLM rubric              |
| **P7-T01**       | `RD-1`                                                                                                                                                                      | drop vestigial 8-pillar devDeps from module-registry                |
| **P7-T02**       | `RD-7`                                                                                                                                                                      | fix stale `POPS_PILLARS` seed default                               |
| **P7-T03**       | `RD-3`                                                                                                                                                                      | shell `defaultRegistryEntries()` → runtime `/pillars` (keystone)    |
| **P7-T04**       | `RD-4`                                                                                                                                                                      | API settings aggregation off `MODULES.settings`                     |
| **P7-T05**       | `RD-5`, `RD-2` (relabel half)                                                                                                                                               | relabel module-registry as build-time validator                     |
| **P7-T06**       | `RD-8`                                                                                                                                                                      | `POPS_PILLARS` default → empty                                      |
| **P7-T07**       | `RD-9`                                                                                                                                                                      | `KnownPillarId` → `string`                                          |
| **P7-T08**       | `RD-10`                                                                                                                                                                     | `bundle-map.tsx` completeness guard                                 |
| _(deferred)_     | `RD-6`, sdk/settings npm rename                                                                                                                                             | tracked no-op; standalone post-migration PRs                        |
| **`05`-owned**   | `P-ci-T-discover/-libs/-fe-fix/-fe-final/-iso/-registry/-docker/-mcp-fix/-moltbot/-publish/-rust`, `P-deploy-T-gate/-secrets/-pops-pillars/-legacy-drop`, `P-e2e-T-rewrite` | CI/deploy/e2e tasks — defined in `05-cicd-deployment.md` §E/§F      |

`P-deploy-T-pops-pillars` == `RD-8` == `P7-T06` (compose seed empty); the deploy-gate prerequisite
side of it lives in `05`, the compose edit in `03`/`06`.

| Phase                     | What                                                                                                                                                              | Owns                                                                                     | Detail file |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------- |
| **P0**                    | working-tree cleanup PR (already green) + drop residual `turbo.json` glob in CI + `git rm` the dead `infra/docker/pillar.Dockerfile` template (audit)             | scripts/contract removal, services/ removal, dep-cruiser retarget, dead-template removal | `01`        |
| **G0**                    | scaffold: add `libs/*` to `pnpm-workspace.yaml` (serial gate, **before** any lib move)                                                                            | workspace glob                                                                           | `01`/`02`   |
| **R1/R2/R3**              | relocation waves: TS libs (`R1`), rust libs (`R2`), apps→pillars (`R3`) — wave-batched, 3 lanes                                                                   | `git mv` + Dockerfile/compose/workflow path strings                                      | `02`/`03`   |
| **G1**                    | dissolve empty `apps/`,`packages/`,`crates/`; drop their globs                                                                                                    | workspace glob cleanup                                                                   | `02`        |
| **C0–Cn**                 | config retarget (dep-cruiser, compose, workflows, Dockerfiles) — file-disjoint, parallel                                                                          | path strings only                                                                        | `02`/`03`   |
| **Phase G (build)**       | DROP turbo: root `tsconfig.build.json`, per-unit `mise.toml`, de-turbo scripts, CI disk-discovery. (Dockerfile generator **DECIDED retired** — see §8 hotspot 5.) | mise + tsc -b; Dockerfiles hand-maintained                                               | `04`        |
| **Phase CI/Deploy**       | agent PR lifecycle, generalized matrix, progressive deploy, REST e2e                                                                                              | `unit-quality.yml`, `agent-review.yml`, `deploy-gate.yml`                                | `05`        |
| **Phase ISO**             | isolation enforcement + extractability checks (dep-cruiser ISO-R1..R4, exports discipline, sandbox)                                                               | `.dependency-cruiser.cjs`, `scripts/`                                                    | `07`        |
| **Phase RD (north-star)** | dissolve `module-registry` static manifest + `POPS_PILLARS` static list → runtime discovery                                                                       | shell boot source, settings aggregation, `KnownPillarId`→`string`                        | `06`        |

**Critical path (longest serial chain):**
`P0 → G0 → R1(ui) → R3(storybook-fold) → G1 → C(fe/storybook globs) → Phase-G(tsconfig refs → de-turbo → remove turbo → CI matrix)`. Everything else fans out under it. The dominant _risk_ is `pnpm-lock.yaml` contention (P-10) and the **non-existent root `tsc -b` graph** (net-new authoring, not migration).

---

## 8. Coupling hotspots (sequence carefully — full treatment in `06`)

| #   | Hotspot                                                                                                                                                                                                                                                                                                 | One-line status                                                                                                          | Resolution                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `module-registry` imports all 8 pillars (a lib importing every pillar) + static manifest                                                                                                                                                                                                                | **~70% already decoupled** — source walks disk via `./manifest`; residue is vestigial devDeps + committed `generated.ts` | `RD-1` drop devDeps; `RD-2/5` reclassify as build-time _validator_; keep `generated.ts` as CI drift-guard                                                                                                                                                                           |
| 2   | `shell` statically imports every `app-*` (`bundle-map.tsx`)                                                                                                                                                                                                                                             | **intentional** (ADR-002: in-repo FE = one Vite SPA); imports are by _name_ so survive the move untouched                | keep static map for in-repo pillars; `external-ui.tsx` dynamic `import(url)` is the only growth path for extracted pillars                                                                                                                                                          |
| 3   | `overlay-ego` in cerebrum, consumed by shell + app-cerebrum                                                                                                                                                                                                                                             | classification **LOCKED = LIB** (§4.1)                                                                                   | relocates to `libs/overlay-ego` (P2-T01); `→libs/ego-ui` rename **deferred** (§4.1); placement mechanics in `06`                                                                                                                                                                    |
| 4   | `POPS_PILLARS` static default omits ai/cerebrum/contacts/orchestrator                                                                                                                                                                                                                                   | already demoted to **seed/fallback** (not source of truth)                                                               | `RD-7` fix the seed; `RD-8` default empty once mesh self-assembles; `RD-9` `KnownPillarId`→`string` (most invasive type change — isolate last)                                                                                                                                      |
| 5   | **Dockerfile generation is broken-by-design after the move** (audit): the dead `infra/docker/pillar.Dockerfile` generic template builds via `turbo prune` (dies with turbo), and the 13 per-pillar Dockerfiles are hand-written, marked _"DO NOT EDIT — generator does not understand collapsed shape"_ | **DECIDED 2026-06-22: generator RETIRED** — per-pillar Dockerfiles are hand-maintained going forward; no rebuild         | **P0** `git rm infra/docker/pillar.Dockerfile` (done in the kickoff PR); the commented PILLAR TEMPLATE block in `docker-compose.dev.yml` is removed alongside the `P4-T07` Dockerfile retarget. The 13 live Dockerfiles' `COPY`/path retarget is owned by `C-T07`/`P4-T07` in `03`. |

---

## 9. Glossary

| Term                                         | Definition                                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PILLAR**                                   | A deployable, self-registering capability provider with a contract; opaque internals; consumed only via its published contract (runtime REST + discovery, or build-time published artifact). §1.                                |
| **LIB**                                      | Package-shaped code that facilitates pillars existing; local now, always extractable; language-agnostic; consumed by import of its published surface. §1.                                                                       |
| **Contract**                                 | A unit's _only_ legitimate consumption surface. TS: the `exports` map (gated by `files`). Rust: the crate's `pub` surface. Runtime: REST + the `/registry` discovery snapshot.                                                  |
| **Contract seam / isolation rule**           | Consume across contracts freely; never reach behind one into internals. §2.                                                                                                                                                     |
| **Reach-behind / behind-the-contract reach** | Importing a path/symbol of another unit that is not reachable from its `exports` / not `pub`. Forbidden (ISO-R1..R3).                                                                                                           |
| **Extract-to-own-repo litmus test**          | "Could this unit move to its own repo and still build/deploy/self-register, changing only where shared deps come from?" The acceptance bar for every classification. §3.                                                        |
| **Compiled lib**                             | A lib whose `build` emits `dist/` + `.d.ts` (consumed as built artifact): `types`, `db-types`, `sdk`, `settings`, `ai-telemetry`, `module-registry`. Needs `tsc -b` ordering.                                                   |
| **Source lib**                               | A lib with **no** `build` script, consumed as TS source and bundled by the consumer (vite): `ui`, `navigation`, `ego-ui`(overlay-ego), all `app-*`. No `dist`, no project references.                                           |
| **Pillar backend / frontend**                | `pillars/<x>/src/{api,contract,db}` (backend, emits `dist/`, Dockerized) and `pillars/<x>/app` (frontend, source-lib, bundled by shell). Both belong to the same pillar unit.                                                   |
| **Aggregator**                               | A unit importing many others: `shell` (all `app-*` + libs) and `storybook` (all `app-*` + ui). The two chokepoints.                                                                                                             |
| **Self-registration**                        | A pillar POSTing register/heartbeat/deregister to core's `/registry/*` on boot (TS: `@pops/pillar-sdk` `bootstrap/register`; Rust: `registry/lifecycle.rs`), gated by `POPS_REGISTRY_ENABLED`/`POPS_REGISTRY_URL`.              |
| **Registry snapshot**                        | Core's DB-backed `/registry` (`GET /core.registry.list`; canonical `GET /registry/pillars` stubbed later) — the runtime source of truth for which pillars exist. The deploy/e2e gate reads this, not a static list.             |
| **`POPS_PILLARS`**                           | Legacy env list of pillars; now only a boot **seed/fallback**, slated to default empty (`RD-8`) once self-registration is reliable.                                                                                             |
| **`module-registry` (→ validator)**          | The lib that built the static `MODULES` manifest. Being reclassified as a build-time _manifest validator_ (role A: cross-pillar invariant checks); its runtime role (role B: shell boot set) moves to the live registry (`06`). |
| **`bundle-map.tsx`**                         | Shell's static `import` of all in-repo `@pops/app-*` (ADR-002). Imports are by name ⇒ survive relocation untouched.                                                                                                             |
| **`external-ui.tsx`**                        | Shell's runtime loader (`import(url)`) for out-of-repo/extracted pillar UIs — the sanctioned growth path (NOT module federation).                                                                                               |
| **`tsc -b` / project references**            | TypeScript's incremental, topologically-ordered build across `tsconfig` `references`. The structural replacement for turbo's `^build`. Net-new (no references exist today).                                                     |
| **mise**                                     | Polyglot toolchain + task runner. Per-unit `mise.toml` gives uniform `build`/`test`/`typecheck`/`lint`/`dev` entrypoints across TS + Rust; the root `mise.toml` holds graph-aware orchestration.                                |
| **Wave-batching**                            | Landing a relocation lane as one PR (not per-unit) to avoid `pnpm-lock.yaml` merge thrash. P-10.                                                                                                                                |
| **Disk-discovery**                           | CI deriving the unit list from `find pillars libs -maxdepth 1 -type d` + a manifest check, instead of a hand-maintained list. The GOOD pattern to extend.                                                                       |
| **ADR-002**                                  | Architecture decision: in-repo frontend is a single static Vite SPA (rejects module federation); justifies the static `bundle-map.tsx`.                                                                                         |
| **Extractability sandbox (EX-2)**            | CI job that copies a unit out, repoints shared deps to packed tarballs/pinned versions, and proves it builds alone — mechanizing the litmus test.                                                                               |
| **Repo-meta tooling**                        | Root `scripts/` (or `ci/`) artifacts that are _not_ units (e.g. `check-pillar-schema-coverage.mjs`, isolation/extractability checks, discovery helpers, the cargo workspace root). Not subject to the litmus test.              |
