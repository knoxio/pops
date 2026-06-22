# Repo Federation Plan

Reorganize the POPS monorepo from a type-first layout (`apps/`, `packages/`, `crates/`) into a provider-first **federation** (`pillars/` + `libs/`), and replace **turbo** with a **mise + tsc -b + pnpm + cargo** polyglot build model. The plan is authored for execution by **autonomous parallel agents** working in git worktrees, whose PRs are agent-reviewed, tested, auto-merged, and progressively auto-deployed.

## Two-kind taxonomy (the locked north-star)

| Kind       | Definition                                                                                                         | Consumed via                                                                                | Lives in   |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------- |
| **PILLAR** | A deployable, self-registering capability provider with a contract; opaque internals.                              | ONLY its published contract (runtime REST + discovery, or a build-time published artifact). | `pillars/` |
| **LIB**    | Any code that facilitates pillars existing; package-shaped, language-agnostic, always extractable to its own repo. | Its published name (`@pops/<x>` exports map / crate root).                                  | `libs/`    |

**Isolation rule:** consume _across_ contracts freely (a pillar may depend on another unit's published lib/types); **never** reach _behind_ a contract into another unit's internals. **Litmus test for every unit:** "could it be extracted to its own repo and still build/deploy/self-register, changing only where shared deps come from?"

## Plan files (reading order)

| #   | File                          | One-line description                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | `README.md` (this file)       | Index, reading order, agent execution protocol, status snapshot, glossary pointer.                                                                                                                                                                                                                                                                  |
| 00  | `00-architecture.md`          | The conceptual anchor (LOCKED): two-kind taxonomy, contract-seam isolation rule, extract-to-own-repo litmus, final `pillars/` + `libs/` target layout + full per-unit classification, build-model summary, phase/task-ID index, coupling hotspots, and the **glossary** (§9).                                                                       |
| 01  | `01-dependency-dag.md`        | Verified `@pops/*` internal graph (30 TS units + 3 crates), topological layering L0–L4, move-order DAG, parallel groups, critical path, conflict matrix, lockfile-contention strategy.                                                                                                                                                              |
| 02  | `02-build-system.md`          | DROP turbo → mise per-unit `mise.toml` + root aggregate; `tsc -b` project-reference graph (`^build` replacement); cargo workspace decision; caching/affected story; turbo→mise command cheat-sheet.                                                                                                                                                 |
| 03  | `03-execution-phases.md`      | **The canonical PR-sized, parallelizable task backlog** (defines every `P0..P7-T*` task): phase map, `git mv` relocation mechanics + per-move lockstep edits (Dockerfile COPYs, compose, workflow globs, Cargo members), parallel-group/dependency summary, per-language local gate. All `depends-on` references resolve to a `P*-T*` heading here. |
| 04  | `04-isolation-enforcement.md` | dep-cruiser rules ISO-R1..R4, exports-map discipline, mechanized extractability checks (EX-1/2/3), `module-registry` de-pillaring, Rust crate boundaries + cargo-deny.                                                                                                                                                                              |
| 05  | `05-cicd-deployment.md`       | Agent PR lifecycle, local CI gate, agent review + isolation guards, generalized disk-discovery matrix (`_discover-units.yml`), progressive deploy via tag promotion + registration gate, E2E rebuilt on REST.                                                                                                                                       |
| 06  | `06-registry-decoupling.md`   | Coupling hotspots; runtime-discovery is ~70% built; finishing tasks RD-1..RD-9 (flip shell boot to live `/pillars` snapshot, kill static `POPS_PILLARS`, `KnownPillarId`→`string`).                                                                                                                                                                 |
| 07  | `07-risks.md`                 | Risk register, rollback strategy, and parallel-agent failure modes; per-phase risk concentrations (RD-3, RD-9) and recovery playbooks.                                                                                                                                                                                                              |

Read `00`→`01`→`03` to understand the target, the dependency graph, and the move; `02` for the build swap; `05` for the pipeline; `04` and `06` for the deepest semantic decoupling that lands **after** relocation; `07` for the risk/rollback register that spans all phases. The glossary is **§9 of `00-architecture.md`** — there is no standalone glossary file.

## Phase / task-ID map

> **Canonical task IDs are `P<phase>-T<nn>`, defined in `03-execution-phases.md`.** The analysis
> docs (`01`,`02`,`04`,`06`,`07`) use alias families (`R*`,`G-T*`,`C-T*`,`RD-*`,`ISO-*`,`EX-*`,`RUST-*`);
> resolve any alias to its canonical `P*-T*` task via the **crosswalk in `00-architecture.md` §7.1**.
> `05-cicd-deployment.md` defines its own canonical `P-ci-*`/`P-deploy-*`/`P-e2e-*` family (also in the §7.1 crosswalk).

| Phase             | Canonical IDs (`03`) | Alias family                | Theme                                                                                                                 | Gating                                                                             |
| ----------------- | -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Phase 0           | `P0-T01`,`P0-T02`    | `P0`                        | Working-tree cleanup (dead contract/boundary tooling, `services/`, `version.txt`) + drop `turbo.json` workflow globs. | Already staged in working tree; lands first, green.                                |
| Gate G0           | `P1-T01`             | `G0`                        | Add `libs/*` to `pnpm-workspace.yaml` (serial gate, before any lib move).                                             | Serial.                                                                            |
| Relocation        | `P2-T01..T04`        | `R1-*` `R2-*` `R3-*`        | TS lib moves / rust lib moves / app→pillar moves / storybook fold (wave-batched, 3 lanes).                            | After G0; lanes parallel (different lockfiles).                                    |
| Gate G1           | `P3-T01`             | `G1`                        | Drop `apps/*`+`packages/*` globs, delete empty dirs.                                                                  | Serial, after all relocation lanes.                                                |
| Config            | `P4-T01..T07`        | `C-T01..C-T07`              | Retarget shared config (depcruise, compose, workflow globs, Dockerfile COPYs).                                        | One PR per shared file → up to 7-wide.                                             |
| Build model       | `P5-T01..T05`        | `G-T01..G-T06`              | tsc -b graph, per-unit `mise.toml`, de-turbo, CI disk-discovery, remove turbo.                                        | Critical-path tail; partly serial.                                                 |
| Isolation         | `P6-T01..T05`        | `ISO-*` / `EX-*` / `RUST-*` | dep-cruiser rules, exports/files whitelists, extractability gates, cargo-deny, agent-review guards.                   | Can land alongside/after build model.                                              |
| Registry decouple | `P7-T01..T08`        | `RD-1..RD-10`               | Finish runtime discovery; kill static manifest/`POPS_PILLARS`; widen `KnownPillarId`.                                 | After relocation; P7-T03 (RD-3) and P7-T07 (RD-9) are the two risk concentrations. |

**Critical path (longest serial chain):** `P0-T01 → P1-T01 → P2-T01(ui) → P2-T04(storybook-fold) → P3-T01 → P4-T04(fe/storybook globs) → P5-T01(tsc-b refs) → P5-T03(de-turbo scripts) → P5-T05(remove turbo) → P5-T04(CI matrix)` (~10 serial PRs). Everything else fans out under it.

## Agent execution protocol (brief)

> `<TASK-ID>` is always a **canonical `P*-T*` ID** (or a `05` `P-ci-*`/`P-deploy-*`/`P-e2e-*` ID). If a
> task is described by an alias (`R*`,`G-T*`,`C-T*`,`RD-*`,`ISO-*`,`EX-*`,`RUST-*`) in an analysis doc,
> first resolve it to its canonical ID via the **crosswalk in `00-architecture.md` §7.1**, then open the
> full task definition (scope/files/depends-on/acceptance/verify/rollback) in `03-execution-phases.md`.

```
TaskCreate
  └─ git worktree add ../pops-wt/<TASK-ID> -b feat/<TASK-ID>-<slug> main
       └─ mise install            # toolchains from per-unit + root mise.toml
       └─ pnpm install            # frozen unless the task edits a manifest
  └─ implement (scope = exactly one PR-sized task)
  └─ LOCAL CI GATE (must pass before push; mirrors required checks):
       mise run ci-changed        # lint, format:check, lint:boundaries, typecheck, test on changed units
       <rust touched> → mise run ci-rust   # fmt --check, clippy -D warnings, test, cargo deny
  └─ git push && gh pr create     # branch off main; NEVER push to main directly
  └─ AGENT REVIEW (both required):
       1. CodeRabbit  — on CHANGES_REQUESTED: address, then DISMISS via API so the block clears
       2. agent-review.yml — LLM rubric (federation invariants) + deterministic guards
          (check-contract-isolation, check-lib-no-pillar-import)
  └─ required checks green + ≥1 approving review + branch up-to-date
  └─ gh pr merge --auto --squash   # no human in the loop on green
  └─ git worktree remove
  └─ PROGRESSIVE DEPLOY (pillars only):
       publish changed image → :staging tag → staging Watchtower rolls
       → wait-registration.mjs (poll core /registry: health + version==sha + fresh heartbeat)
       → promote :staging → :main (retag same digest) → prod Watchtower pulls (60s poll)
       rollback = retag :main to prior good sha-* digest
```

### Hard constraints baked into every task

- **CI must NEVER fail:** each phase/PR green before the next; run the local gate before commit.
- No `as any`, no `as unknown as T`, no `eslint-disable`/`ts-ignore`/suppressions — fix root cause.
- **oxlint + oxfmt** (NOT eslint/prettier). pnpm@10 + node 22 in CI / 24 local via mise. husky + lint-staged pre-commit.
- PRs branch off `main`; ruleset requires PR. Do **not** add Claude as co-author or reference Claude in commits/PRs. Images publish to `ghcr.io/knoxio`.
- DRY; no orphan TODOs; comments only for non-obvious _why_.
- **Lockfile rule:** a task may edit `pnpm-lock.yaml` only if its `parallel-group` size is 1; pure moves within a wave batch into one PR to avoid lockfile thrash.

Every executable task in the plan files states: **scope · exact files touched · depends-on (task IDs) · parallel-group · acceptance criteria (checkboxes) · verify commands (runnable) · rollback.**

## Decisions locked (2026-06-22)

| Topic                                                      | Resolution                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dockerfile generator**                                   | **RETIRED** — per-pillar Dockerfiles are hand-maintained; the dead `infra/docker/pillar.Dockerfile` template is removed in the kickoff PR. No generator rebuild. |
| **`overlay-ego` → `ego-ui` rename**                        | **APPROVED**, executed as a deferred standalone PR post-migration (coordinate with PRD-087). Relocates as `libs/overlay-ego` first.                              |
| **`module-registry` → `pillar-manifest-validator` rename** | **APPROVED**, deferred (`RD-6` / `P7-T05`) to avoid churning importers.                                                                                          |
| **CI vs local Node**                                       | **`jdx/mise-action@v2` is the sole manager** — CI node 22 via `MISE_ENV=ci`, local 24; no `setup-node`. Pin latest-safe action versions.                         |
| **Deploy-gate Tailnet reach**                              | **GH-hosted runner + `tailscale/github-action@v3`** (ephemeral join); self-hosted on capivara = future optimization.                                             |

## Current status snapshot

- **Branch:** `main` @ `fb56d4d0`.
- **Already home (no move):** 8 backend pillars (`core ai cerebrum finance food inventory lists media`) + 7 frontends (`pillars/*/app`) + `contacts` (rust) all live under `pillars/`.
- **Phase 0** working-tree cleanup is **staged in the working tree** (removed `scripts/contract/`, `services/`, `version.txt`, `.impeccable.md`, dead boundary-generator config; retargeted dep-cruiser to `pillars/*/app`). Verified green (`lint:boundaries` 1404 modules / 0 violations; `format:check`/`lint` exit 0). Becomes the first PR.
- **Runtime discovery is ~70% built:** DB-backed registry, SDK + Rust self-registration (register/heartbeat/deregister), external-UI loader, and disk-discovery all exist on `main`. Registry decoupling (RD-\*) is **finishing**, not green-field — the residual static artifacts are `module-registry` vestigial pillar devDeps + committed `generated.ts`, shell `bundle-map.tsx` (kept per ADR-002), and the stale `POPS_PILLARS` seed default.
- **Known live holes (fix early):** `fe-quality.yml`/`storybook-quality.yml` globs watch deleted `packages/app-*/**` and miss `pillars/*/app/**` (FE changes skip CI today); `module-registry-quality.yml` is the last turbo invocation in CI; `apps/pops-mcp/Dockerfile` runs `pnpm install` with no `--filter`.

## Glossary

See **§9 of `00-architecture.md`** for canonical definitions (PILLAR/LIB, contract surface, compiled vs source lib, extraction litmus, task-ID scheme, parallel-group semantics, worktree protocol). Terms used across all plan files resolve there. There is no standalone glossary file.
