# 05 — CI/CD + Agent Pipeline + Progressive Deployment

> Companion to `00-architecture.md`, `03-execution-phases.md` (relocation + backlog), `02-build-system.md`, `04-isolation-enforcement.md`. Task IDs use the shared `P*-T*` scheme. This file owns the `P-ci-*`, `P-deploy-*`, `P-e2e-*` task families. Repo: `/Users/joao/dev/personal/pops`, branch `main` (`fb56d4d0`).

This document defines: (A) the autonomous-agent PR lifecycle, (B) matrix discovery generalized to `pillars/` + `libs/` across TS and Rust, (C) progressive automatic deployment for self-registering pillars, (D) E2E rebuilt against REST, (E) the per-phase workflow edit schedule.

---

## 0. Current-state inventory (what we inherit)

| Workflow                                                                                                                                                             | Trigger                                       | Discovery model                                                                         | Federation verdict                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `quality.yml`                                                                                                                                                        | PR/push, `paths-ignore: docs,*.md`            | none (workspace-wide `pnpm lint`/`format:check`/`lint:boundaries`/`jscpd`)              | KEEP. Path-agnostic. Add `isolation:check` step (see `04-isolation-enforcement.md`).                          |
| `pillar-quality.yml`                                                                                                                                                 | `pillars/**` + shared libs                    | **disk discovery** (`find pillars -maxdepth 1` w/ `package.json`) + matrix              | GOLD pattern. Generalize to `pillars/` AND `libs/` via `_discover-units.yml`.                                 |
| `pillar-schema-coverage.yml`                                                                                                                                         | `pillars/*/src/db/**`                         | disk discovery (`src/db/schema.ts`) + matrix + self-test                                | KEEP. Retarget only lib-dep trigger globs (none today; verify).                                               |
| `publish-images.yml`                                                                                                                                                 | `workflow_dispatch` only                      | disk discovery from compose `image:` refs ∩ `pillars/*/Dockerfile` + static `apps:` job | Generalize; delete `apps:` job; re-enable `push:main`; add staged rollout.                                    |
| `docker-build.yml`                                                                                                                                                   | Dockerfile/compose changes                    | hard-codes `apps/pops-shell`, `apps/pops-mcp` + `for pillars/*/Dockerfile`              | Edit: apps→pillars paths; drop `turbo.json` glob.                                                             |
| `fe-quality.yml`                                                                                                                                                     | `apps/pops-shell`, **`packages/app-\*/**`\*\* | path-filter, NOT disk-discovered                                                        | **BROKEN**: watches deleted `packages/app-*`, misses `pillars/*/app/**`. Rewrite (land EARLY).                |
| `fe-test-e2e.yml`                                                                                                                                                    | `workflow_dispatch` only                      | targets dead `/trpc`                                                                    | Rewrite against REST (section D).                                                                             |
| `release.yml` (+ `.github/scripts/release.sh`)                                                                                                                       | `workflow_dispatch`                           | conventional-commit bump, tag-only                                                      | KEEP; re-enable `push:main`. Language-agnostic.                                                               |
| `rust-quality.yml`                                                                                                                                                   | `crates/**`, `pillars/contacts/**`            | whole-workspace cargo (no matrix)                                                       | Generalize paths to `libs/pops-{ai,settings}` + rust pillars; add cargo-deny (`04`).                          |
| `_pkg-check.yml` + per-lib `*-quality.yml` (`ui`, `navigation`, `db-types`, `ai-telemetry`, `pillar-settings`, `module-registry`, `ai`, `orchestrator`, `storybook`) | per-package path-filter, `workflow_call`      | **DELETE all**; fold into one disk-discovered `unit-quality.yml` matrix.                |
| `module-registry-quality.yml`                                                                                                                                        | —                                             | runs `turbo run registry:build` + `git diff generated.ts`                               | **Only remaining `turbo` invocation in CI.** Delete coupled with module-registry dissolution (`RD-*` / `04`). |
| `format-drift-watchdog.yml`, `infra-lint.yml`, `workflows-quality.yml`                                                                                               | misc                                          | —                                                                                       | KEEP (root meta-tooling). Verify no `apps/`/`packages/` literals.                                             |

**Assets the deploy design rests on (already on `main` — do not reinvent):**

| Asset                                                    | Path                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-registration (register + heartbeat + deregister) TS | `packages/pillar-sdk/src/bootstrap/register.ts`, `.../bootstrap.ts`                                                                         |
| Self-registration Rust parity                            | `pillars/contacts/src/registry/lifecycle.rs`, `.../transport.rs`                                                                            |
| Core registry routes (DB-backed truth)                   | `pillars/core/src/api/pillars/registry.ts`, `.../modules/registry/snapshot.ts`                                                              |
| Registry toggle                                          | `POPS_REGISTRY_ENABLED` / `POPS_REGISTRY_URL` (compose)                                                                                     |
| Deploy substrate                                         | Watchtower `containrrr/watchtower:1.7.1`, `WATCHTOWER_ROLLING_RESTART=true`, `POLL_INTERVAL=60`, label-gated, pulls `ghcr.io/knoxio/pops-*` |
| Stale config to kill                                     | `POPS_PILLARS` compose default omits `ai`/`cerebrum`/`contacts`/`orchestrator`                                                              |

---

## A. Agent-driven PR lifecycle

One task = one git worktree = one PR. Pipeline per task:

```
TaskCreate → git worktree add (branch off main) → implement → LOCAL CI GATE
  → push → gh pr create → automated agent review → required checks green
  → auto-merge (squash) → worktree teardown → deploy (section C)
```

### A.1 Worktree isolation

```bash
# per task, e.g. P2-T04 (libs/ui move)
git -C /Users/joao/dev/personal/pops worktree add \
  ../pops-wt/P2-T04 -b feat/P2-T04-libs-ui main
cd ../pops-wt/P2-T04
mise install            # toolchains from root + per-unit mise.toml (node 22 CI / 24 local, rust stable, pnpm 10)
pnpm install            # frozen unless the task intentionally edits a manifest
```

**Lockfile hazard rule (baked into every task):** parallel agents that all touch `pnpm-lock.yaml` collide on merge. A task may edit the lockfile **only if it is in a `parallel-group` of size 1** (dependency-graph-moving tasks serialize). Pure move/rename tasks within a wave must not change resolution — see `03-execution-phases.md` Phase 2 wave-batching (one PR per wave) which is the binding mitigation. Rust tasks touch `Cargo.lock`, not `pnpm-lock.yaml`, so the rust lane is freely concurrent with the TS lanes.

### A.2 Local CI gate (MUST pass before push — mirrors required checks)

A single root entrypoint reproduces the GH matrix locally so "CI never fails" holds:

```toml
# mise.toml (root) — uniform entrypoints (see 02-build-system.md)
[tasks.ci]          # full gate (what main-branch CI runs)
depends = ["lint", "format-check", "boundaries", "typecheck", "test"]
[tasks.ci-changed]  # what the agent runs pre-push: only changed units
run = "scripts/ci/run-changed.sh"
[tasks.ci-rust]
run = "cargo fmt --all --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test --all"
```

`tsc -b tsconfig.build.json` replaces turbo's `^build` ordering (project references across `libs/` + `pillars/`, see `03`). The agent runs verbatim before `git push`:

```bash
mise run ci-changed \
  && { git ls-files -m | grep -q '\.rs$' && mise run ci-rust || true } \
  && pnpm run isolation:check        # see 04-isolation-enforcement.md (lint:boundaries + exports + EX-1 + EX-3)
```

**Acceptance for any task:** the above command exits 0 locally before push. No exceptions (HARD CONSTRAINT "CI never fails").

### A.3 Automated agent review (the review gate)

Two layers, both required:

1. **Deterministic bot review** — CodeRabbit (already in use). On `CHANGES_REQUESTED`, the executing agent addresses, then **dismisses the review via API** so the block clears (learned behavior, `MEMORY feedback_coderabbit_dismiss.md`).
2. **LLM reviewer job in-CI** — required `agent-review` check, Opus reviewer against the diff with federation invariants as rubric, backed by two **deterministic static guards** that catch invariants the LLM can miss.

```yaml
# .github/workflows/agent-review.yml
name: Agent Review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions: { pull-requests: write, contents: read }
jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - name: Isolation litmus — no cross-contract reach-behind
        run: node scripts/ci/check-contract-isolation.mjs --base "origin/${{ github.base_ref }}"
      - name: Lib-never-imports-pillar guard
        run: node scripts/ci/check-lib-no-pillar-import.mjs
      - name: LLM review (rubric = federation invariants)
        env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }
        run: node scripts/ci/agent-review.mjs --pr ${{ github.event.number }}
```

**Rubric (LLM + static where possible):** no `as any` / `as unknown as T` / `eslint-disable` / `ts-ignore`; no cross-contract reach-behind; lib never imports a pillar; no orphan TODO; no Claude reference in commit/PR; extractability litmus stated in PR body. The two static guards (`check-contract-isolation`, `check-lib-no-pillar-import`) are load-bearing; the LLM catches taste/intent. Both guards live in root `scripts/ci/` alongside `check-pillar-schema-coverage.mjs`. (These overlap with `04-isolation-enforcement.md`'s `lint:boundaries` ISO-R1/R2; the agent-review guards are the diff-scoped fast pass, `lint:boundaries` is the whole-tree pass.)

### A.4 Required checks + auto-merge

Branch ruleset with `strict_required_status_checks_policy: false` so non-triggered workflows don't block (preserves the docs-only ≤4-checks property in `quality.yml`).

| Check                                                      | Source workflow              | Required when                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Lint`, `Format`, `Module boundaries`, `Duplication check` | `quality.yml`                | always (non-docs)                                                                                                                                                           |
| `<unit> — ts` / `<unit> — rust`                            | `unit-quality.yml` matrix    | per changed unit (`pillars/*` + `libs/*`, NOT `app-*`)                                                                                                                      |
| `app frontends` (typecheck/lint/test)                      | `fe-quality.yml`             | when `pillars/*/app/**` or `pillars/shell/**` or `libs/{ui,navigation,overlay-ego}/**` changed (dir is `libs/overlay-ego` — the `→ego-ui` rename is deferred per `00` §4.1) |
| `<unit> schema coverage`                                   | `pillar-schema-coverage.yml` | when `*/src/db/**` changed                                                                                                                                                  |
| `agent-review` (incl. isolation guards)                    | `agent-review.yml`           | always (non-draft)                                                                                                                                                          |
| `Validate Docker builds` / `Validate docker-compose`       | `docker-build.yml`           | when Dockerfile/compose changed                                                                                                                                             |
| `e2e-smoke`                                                | `fe-test-e2e.yml`            | when shell/contract/app changed (section D)                                                                                                                                 |

**Auto-merge conditions** (`gh pr merge --auto --squash` per PR):

- [ ] all required checks green
- [ ] CodeRabbit not in `CHANGES_REQUESTED`
- [ ] `agent-review` pass (LLM posts an approving review when rubric passes)
- [ ] branch up-to-date with main (ruleset `required_linear_history` → squash)

No human in the loop on green.

---

## B. Generalized matrix discovery — pillars AND libs, polyglot, changed-only

The `pillar-quality.yml` disk-discovery generalizes to one reusable step emitting a typed unit list `{name, pkg, dir, kind, lang}`, consumed by every matrix workflow. A unit is anything under `pillars/` or `libs/` with a recognized manifest:

- `package.json` → `lang=ts`, `pkg` = `package.json#name` (the workspace selector for `pnpm --filter`)
- `Cargo.toml` (non-workspace-stub) → `lang=rust`, `pkg` = Cargo `name` (the cargo selector for `cargo -p`)
- `name` = directory basename (display/path key only — NEVER a `--filter`/`-p` selector)
- `kind` = `pillar` if dir starts `pillars/`, else `lib`

**Dir-name ≠ pkg-name trap (LOCKED, `00` P-7 / `01` R1-T03·R1-T04):** npm/crate names are kept unchanged during the move, so `libs/sdk` publishes `@pops/pillar-sdk` and `libs/settings` publishes `@pops/pillar-settings` (and any future rename keeps this skew). `pnpm --filter` / `cargo -p` MUST select on `pkg`, never on `@pops/${name}` — `pnpm --filter @pops/sdk` matches zero packages and **exits 0** (warning, not error), so deriving the selector from the directory would silently run nothing and leave those units unguarded. The matrix steps below select on `matrix.unit.pkg` exclusively.

### B.1 Reusable discovery — `.github/workflows/_discover-units.yml`

```yaml
on:
  workflow_call:
    outputs:
      units: { value: '${{ jobs.list.outputs.units }}' }
      changed: { value: '${{ jobs.list.outputs.changed }}' }
jobs:
  list:
    runs-on: ubuntu-latest
    outputs:
      units: ${{ steps.scan.outputs.units }}
      changed: ${{ steps.scan.outputs.changed }}
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 } # need merge-base for changed-detection
      - id: scan
        run: |
          set -euo pipefail
          crate_name() {                      # $1 = Cargo.toml path; read [package] name, fall back to dir
            awk '/^\[package\]/{p=1;next} /^\[/{p=0} p&&/^name[[:space:]]*=/{gsub(/.*=[[:space:]]*"|"[[:space:]]*$/,"");print;exit}' "$1"
          }
          emit() {                            # $1 = root (pillars|libs)
            find "$1" -mindepth 1 -maxdepth 1 -type d | sort | while read -r d; do
              kind=$([ "$1" = pillars ] && echo pillar || echo lib)
              if   [ -f "$d/package.json" ]; then
                lang=ts; pkg=$(jq -r '.name' "$d/package.json")
              elif [ -f "$d/Cargo.toml"   ] && grep -q '^\[package\]' "$d/Cargo.toml"; then
                lang=rust; pkg=$(crate_name "$d/Cargo.toml")
              else continue; fi            # config-only dirs (e.g. moltbot, workspace stubs) skipped — see §E moltbot note
              [ -n "$pkg" ] && [ "$pkg" != null ] || { echo "::error::no pkg name for $d" >&2; exit 1; }
              jq -n --arg n "$(basename "$d")" --arg pkg "$pkg" --arg dir "$d" \
                    --arg k "$kind" --arg l "$lang" \
                    '{name:$n,pkg:$pkg,dir:$dir,kind:$k,lang:$l}'
            done
          }
          units=$( { emit pillars; emit libs; } | jq -s -c '.')
          echo "units=$units" >> "$GITHUB_OUTPUT"
          base=$(git merge-base "origin/${{ github.base_ref || 'main' }}" HEAD || echo HEAD~1)
          diff=$(git diff --name-only "$base" HEAD)
          # shared-root signal → build ALL (lockfile / base tsconfig / formatter / mise root)
          if echo "$diff" | grep -qE '^(pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json|tsconfig\.build\.json|\.oxfmtrc\.json|\.oxlintrc\.json|mise\.toml|Cargo\.toml|Cargo\.lock)$'; then
            echo "changed=$units" >> "$GITHUB_OUTPUT"
          else
            DIFF="$diff" changed=$(echo "$units" | jq -c \
              '[.[] | select(.dir as $d | ($ENV.DIFF | test("(^|\\n)"+$d+"/")))]')
            echo "changed=$changed" >> "$GITHUB_OUTPUT"
          fi
```

### B.2 Single quality workflow — `.github/workflows/unit-quality.yml`

Replaces `pillar-quality.yml` + every per-lib `*-quality.yml` + `_pkg-check.yml`. Does **not** replace `fe-quality.yml` (the `app-*` frontends at `pillars/*/app` are out of discovery scope — see notes below) or `pillar-schema-coverage.yml`.

```yaml
name: Unit Quality
on:
  pull_request:
    paths: ['pillars/**','libs/**','pnpm-lock.yaml','pnpm-workspace.yaml',
            'tsconfig.base.json','tsconfig.build.json','.oxfmtrc.json','.oxlintrc.json',
            'mise.toml','Cargo.toml','Cargo.lock','.github/workflows/unit-quality.yml']
  push: { branches: [main], paths: [ '**' ] }   # main rebuilds via changed-set
jobs:
  discover:
    uses: ./.github/workflows/_discover-units.yml
  ts:
    needs: discover
    if: ${{ needs.discover.outputs.changed != '[]' }}
    strategy: { fail-fast: false, matrix: { unit: ${{ fromJson(needs.discover.outputs.changed) }} } }
    runs-on: ubuntu-latest
    name: ${{ matrix.unit.name }} (${{ matrix.unit.kind }}) — ts
    steps:
      - if: ${{ matrix.unit.lang != 'ts' }}
        run: echo "skip non-ts" && exit 0
      - if: ${{ matrix.unit.lang == 'ts' }}
        uses: actions/checkout@v6
      - if: ${{ matrix.unit.lang == 'ts' }}
        uses: jdx/mise-action@v2
      - if: ${{ matrix.unit.lang == 'ts' }}
        name: assert filter matches exactly one package
        run: |
          n=$(pnpm ls -r --depth -1 --filter "${{ matrix.unit.pkg }}" --json | jq 'length')
          [ "$n" = 1 ] || { echo "::error::--filter ${{ matrix.unit.pkg }} matched $n packages (expected 1) — pnpm --filter exits 0 on zero matches, so this guard is required"; exit 1; }
      - if: ${{ matrix.unit.lang == 'ts' }}
        run: pnpm install --frozen-lockfile --filter "${{ matrix.unit.pkg }}..."
      - if: ${{ matrix.unit.lang == 'ts' }}
        run: pnpm exec oxfmt  --check ${{ matrix.unit.dir }}/
      - if: ${{ matrix.unit.lang == 'ts' }}
        run: pnpm exec oxlint        ${{ matrix.unit.dir }}/src
      - if: ${{ matrix.unit.lang == 'ts' }}
        run: tsc -b ${{ matrix.unit.dir }}/tsconfig.build.json     # builds dep .d.ts via refs; no-op for source libs
      - if: ${{ matrix.unit.lang == 'ts' }}
        run: pnpm --filter "${{ matrix.unit.pkg }}" typecheck
      - name: codegen drift
        if: ${{ matrix.unit.lang == 'ts' }}
        run: |
          scripts=$(node -e "const s=require('./${{ matrix.unit.dir }}/package.json').scripts||{};process.stdout.write(Object.keys(s).filter(k=>k.startsWith('generate:')).join('\n'))")
          [ -z "$scripts" ] || { while read -r s; do [ -z "$s" ] || pnpm --filter "${{ matrix.unit.pkg }}" "$s"; done <<<"$scripts"; git diff --exit-code ${{ matrix.unit.dir }}/; }
      - if: ${{ matrix.unit.lang == 'ts' }}
        run: pnpm --filter "${{ matrix.unit.pkg }}" test
  rust:
    needs: discover
    if: ${{ needs.discover.outputs.changed != '[]' }}
    strategy: { fail-fast: false, matrix: { unit: ${{ fromJson(needs.discover.outputs.changed) }} } }
    runs-on: ubuntu-latest
    name: ${{ matrix.unit.name }} (${{ matrix.unit.kind }}) — rust
    steps:
      - if: ${{ matrix.unit.lang != 'rust' }}
        run: echo "skip non-rust" && exit 0
      - if: ${{ matrix.unit.lang == 'rust' }}
        uses: actions/checkout@v6
      - if: ${{ matrix.unit.lang == 'rust' }}
        uses: jdx/mise-action@v2
      - if: ${{ matrix.unit.lang == 'rust' }}
        run: cargo fmt   -p ${{ matrix.unit.pkg }} --check
      - if: ${{ matrix.unit.lang == 'rust' }}
        run: cargo clippy -p ${{ matrix.unit.pkg }} --all-targets --all-features -- -D warnings
      - if: ${{ matrix.unit.lang == 'rust' }}
        run: cargo build  -p ${{ matrix.unit.pkg }} --all-targets
      - if: ${{ matrix.unit.lang == 'rust' }}
        run: cargo test   -p ${{ matrix.unit.pkg }}
```

**Notes / gotchas:**

- `mise` is the polyglot equalizer — each unit's `mise.toml` pins its toolchain, so the matrix step is uniform regardless of `lang`. CI pins node 22; local mise pins 24 (keep divergent via `MISE_ENV` override or `setup-node` in CI — see `03`).
- **Source-lib reality** (`ui`, `navigation`, `overlay-ego` at `libs/overlay-ego` — `→ego-ui` rename deferred, `00` §4.1): no `build` script, consumed as TS source. `tsc -b <dir>/tsconfig.build.json` is a no-op for them (they have no `composite` project); they get typecheck + lint + test + format here. Their _build_ happens inside the shell pillar's own job (vite bundles them).
- **App frontends are NOT discovered here.** The `app-*` frontends live one level deep at `pillars/<x>/app` (npm names `@pops/app-ai`…`@pops/app-media`), invisible to the `maxdepth 1` scan AND name-colliding (all seven share basename `app`). They are NOT separate deployable units — they are source bundled into the shell pillar's vite build and have no `build` script / Dockerfile / image. Discovery deliberately stops at `maxdepth 1`, so `unit-quality` does **not** cover them; their typecheck/lint/test/format gate is `fe-quality.yml` (retargeted to `pillars/*/app/**`, see §E `P-ci-T-fe-fix` / `P-ci-T-fe-final`). `unit-quality` covers the `shell` pillar itself, whose own build transitively compiles the bundled `app-*` source.
- **App-pillar build-script gap** (audit): shell/mcp/orchestrator/docs have build scripts (`tsc && vite build` / `tsc`); the `if lang==ts` guard + per-unit `mise.toml` task presence handles this — a unit without a `test`/`build` script no-ops that step rather than failing. Verify each app-pillar's `mise.toml` defines the five canonical tasks (`03`).
- **moltbot is invisible to discovery** (verified: no `package.json`, no `Cargo.toml`, only `config/`, `skills/`, `scripts/validate-config.sh`). The discovery `continue` skips any manifest-less dir, so `pillars/moltbot` gets ZERO legs in `unit-quality` and its existing `validate-config.sh` (today triggered only by the compose `moltbot-validator` service, never by a workflow) would otherwise be ungated in CI. Covered explicitly by a dedicated `moltbot-config.yml` path-triggered job — see §E `P-ci-T-moltbot`. Do NOT assume `unit-quality` covers moltbot.
- **Changed-only**: the `changed` output drives the matrix; `shared-root touched → build all` keeps correctness when lockfile/base-tsconfig/formatter/`Cargo.*` move.
- **Empty-matrix safety**: `if: needs.discover.outputs.changed != '[]'` on each lane.
- **`docker/*-action` drift** (audit): normalize `build-push-action`/`metadata-action`/`login-action` to pinned `@v7`/`@v4` in the discovery-rework PR.

---

## C. Progressive automatic deployment (self-registering pillars)

Pipeline: **merge → publish changed images only → staged rollout → health + registration gate → promote**. Deploy substrate is Watchtower on capivara; the gate reads core's `/registry` snapshot — the runtime source-of-truth — so **the deploy gate IS the registration check** (and the thing that proves `POPS_PILLARS` static rot is safe to remove).

### C.1 Publish only changed images — re-enable `push:main`

`publish-images.yml` joins disk-discovery with the changed-unit set so a one-pillar PR doesn't rebuild 13 images. The `staging` tag is published first (NOT `:main`).

```yaml
name: Publish Images
on:
  push: { branches: [main] }     # re-enabled post-colocation
  workflow_dispatch:
jobs:
  discover: { uses: ./.github/workflows/_discover-units.yml }
  publish:
    needs: discover
    if: ${{ needs.discover.outputs.changed != '[]' }}
    strategy: { fail-fast: false, matrix: { unit: ${{ fromJson(needs.discover.outputs.changed) }} } }
    runs-on: ubuntu-latest
    steps:
      - if: ${{ matrix.unit.kind != 'pillar' }}
        run: echo "libs are not images" && exit 0
      - if: ${{ matrix.unit.kind == 'pillar' }}
        uses: actions/checkout@v6
      - name: Has Dockerfile?
        if: ${{ matrix.unit.kind == 'pillar' }}
        id: df
        run: '[ -f "${{ matrix.unit.dir }}/Dockerfile" ] && echo "ok=1" >> "$GITHUB_OUTPUT" || echo "ok=0" >> "$GITHUB_OUTPUT"'
      - if: ${{ matrix.unit.kind == 'pillar' && steps.df.outputs.ok == '1' }}
        uses: docker/login-action@v4
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - if: ${{ matrix.unit.kind == 'pillar' && steps.df.outputs.ok == '1' }}
        id: meta
        uses: docker/metadata-action@v7
        with:
          images: ghcr.io/knoxio/pops-${{ matrix.unit.name }}
          tags: |
            type=raw,value=staging,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern=v{{version}}
      - if: ${{ matrix.unit.kind == 'pillar' && steps.df.outputs.ok == '1' }}
        uses: docker/build-push-action@v7
        with:
          context: .
          file: ${{ matrix.unit.dir }}/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: BUILD_VERSION=${{ github.sha }}
```

Once shell/mcp/orchestrator/docs/moltbot Dockerfiles live at `pillars/<x>/Dockerfile`, the static `apps:` job in `publish-images.yml` is **deleted** — all flow through this disk-discovered matrix.

### C.2 Two-ring rollout via tag promotion

- Push publishes `:staging` + `:sha-<short>`. A **staging Watchtower** (separate compose/host or namespace, distinct `WATCHTOWER_LABEL`) tracks `:staging`. **Production Watchtower tracks `:main` only.**
- A `deploy-gate` job waits for staging convergence, queries core's registry snapshot, and on success **retags `:sha-<short>` → `:main`** in GHCR (no rebuild, same digest). Production Watchtower pulls within `POLL_INTERVAL` (60s).

```yaml
# .github/workflows/deploy-gate.yml — workflow_run after Publish Images (success)
name: Deploy Gate
on:
  workflow_run: { workflows: ['Publish Images'], types: [completed] }
permissions: { contents: read, packages: write }
jobs:
  gate:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest # DECIDED: GH-hosted + Tailscale (ephemeral join); self-hosted on capivara = future optimization
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v2
      - uses: tailscale/github-action@v3
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
          tags: tag:ci
      - id: changed
        run: node scripts/ci/changed-units.mjs --base "${{ github.event.workflow_run.head_sha }}^" --out "$GITHUB_OUTPUT"
      - name: Wait for health + REGISTRATION of changed pillars
        run: node scripts/ci/wait-registration.mjs
          --registry http://core-api:3001
          --units '${{ steps.changed.outputs.units }}'
          --expect-sha ${{ github.event.workflow_run.head_sha }}
          --timeout 300
      - name: Promote staging → main (retag same digest)
        run: |
          short=$(echo "${{ github.event.workflow_run.head_sha }}" | cut -c1-7)
          for u in $(echo '${{ steps.changed.outputs.units }}' | jq -r '.[]|select(.kind=="pillar").name'); do
            docker buildx imagetools create \
              --tag ghcr.io/knoxio/pops-$u:main \
              ghcr.io/knoxio/pops-$u:sha-$short
          done
```

`wait-registration.mjs` is the gate's heart and the kill-switch for `POPS_PILLARS` rot: it polls **core's `/registry`** (live snapshot fed by SDK `register.ts` + Rust `lifecycle.rs` heartbeats) and asserts each changed pillar (a) passes `/health` and (b) appears in the registry with `version/build == head_sha` and a fresh heartbeat. Because the gate reads the runtime registry (not a static list), promotion proves the pillar actually self-registered.

### C.3 Migration-ordering trap (schema-before-image; ai + contacts extraction)

Two ordering rules baked into the gate:

1. **Migration-before-image.** A pillar image self-applies its own migrations on boot (current pattern: `dist/db` opener + journal). The gate must see the registry entry report `schema_version >= image_expected` before promote. If a PR bumps a producer pillar's schema _and_ a downstream consumer, the consumer's promotion `deploy-after` the producer's (encoded in the task's metadata; the gate sequences via the `--units` order + a `--deploy-after` map). Boots-against-missing-table is exactly what `pillar-schema-coverage`'s self-test guards.
2. **ai + contacts extraction window.** When ai (TS) and contacts (Rust) extract, registration envelopes change transport (TS SDK path vs Rust `/registry/*` with legacy `/core.registry.*` 404-fallback). The gate must accept BOTH path shapes during the window: `wait-registration.mjs --accept-legacy-path`. Drop the flag once both extractions land (follow-up task `P-deploy-T-legacy-drop`).

### C.4 Rollback

Promotion is a retag, so rollback = retag `:main` to the previous good digest; Watchtower rolls back next poll (60s):

```bash
docker buildx imagetools create --tag ghcr.io/knoxio/pops-<unit>:main ghcr.io/knoxio/pops-<unit>:sha-<prev>
```

Every deploy task's `rollback:` field is this command with the prior SHA.

---

## D. E2E rebuilt against REST

`fe-test-e2e.yml` is `workflow_dispatch`-dead because every spec mocks `/trpc/**` and seeds via `POST :3000/env/...` (deleted monolith). Rebuild:

| Concern   | Old (dead)                   | New (REST)                                                                                                                                                            |
| --------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harness   | deleted pops-api `webServer` | `docker compose -f infra/docker-compose.e2e.yml up` booting changed REST pillars + shell (shell self-registers as the web pillar; browser is its client per BFF-skip) |
| Seeding   | `POST /env/...`              | per-pillar REST seed endpoints OR direct SQLite seed via each pillar's `db/seeder.ts` (exists, jscpd-ignored)                                                         |
| Layering  | one dead suite               | `e2e-smoke` (required check: core + changed pillar + shell; asserts pillar registers + app-tile renders against live REST) + `e2e-full` (nightly `schedule:`)         |
| Discovery | none                         | drive smoke matrix off `_discover-units.yml changed` — only spin changed pillars                                                                                      |

```yaml
# .github/workflows/fe-test-e2e.yml (rewritten head)
name: E2E
on:
  pull_request:
    paths:
      [
        'pillars/*/app/**',
        'pillars/*/openapi/**',
        'pillars/*/src/contract/**',
        'pillars/shell/**',
        'libs/ui/**',
        'libs/navigation/**',
        'libs/overlay-ego/**',
      ]
  schedule: [{ cron: '0 14 * * *' }] # full suite nightly
jobs:
  discover: { uses: ./.github/workflows/_discover-units.yml }
  smoke:
    needs: discover
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v2
      - run: pnpm install --frozen-lockfile
      - name: Boot changed pillars + core
        run: |
          PILLARS=$(echo '${{ needs.discover.outputs.changed }}' | jq -r '[.[]|select(.kind=="pillar").name]|join(" ")')
          docker compose -f infra/docker-compose.e2e.yml up -d core-api $PILLARS
      - run: node scripts/ci/wait-registration.mjs --registry http://localhost:3001 --units '${{ needs.discover.outputs.changed }}'
      - run: pnpm --filter @pops/shell build
      - run: pnpm --filter @pops/shell exec playwright test --grep @smoke
```

`wait-registration.mjs` is **reused** by both the deploy gate and E2E — "registers correctly" is tested in CI before it gates prod. (Playwright: rely on auto-waiting / `wait-registration` polling; no long explicit timeouts per repo rule 11.)

New artifact: `infra/docker-compose.e2e.yml` (REST pillar stack + shell, no Watchtower, no monolith).

---

## E. Per-phase workflow edits (what changes WHEN)

Cross-referenced to migration phases (`01`–`04`). Each row = a discrete PR-sized CI task. **Sequencing guard (HARD CONSTRAINT):** a new workflow runs in **shadow** (not in required-checks ruleset; `strict_required_status_checks_policy: false` lets a non-required workflow not block) for one PR, is promoted to required only after green on `main` once. An old `*-quality.yml` is deleted **only in the same PR** that proves the new matrix covers its unit (acceptance: `gh run` shows the unit's name in `unit-quality`) — coverage never gaps.

| Phase / trigger                                 | Workflow                                                                                                                                                                                | Edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Task ID                            | Depends-on                                                          | Parallel-group |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- | -------------- |
| **P0** working-tree cleanup                     | `module-registry-quality.yml`, `docker-build.yml`                                                                                                                                       | drop `turbo.json` glob                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `P0-T-ci`                          | P0                                                                  | PG-P0          |
| **Pre-move scaffold**                           | new `_discover-units.yml`, `unit-quality.yml`, `agent-review.yml` + guards                                                                                                              | add in **shadow** (not yet required)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `P-ci-T-discover`, `P-ci-T-review` | P0-T-ci                                                             | PG-ci-scaffold |
| **fe gate fix (land EARLY — live hole)**        | `fe-quality.yml`                                                                                                                                                                        | drop `apps/pops-shell`+`packages/app-*`; watch `pillars/shell/**`+`pillars/*/app/**`+`libs/{ui,navigation}/**`; `cd` paths → `pillars/shell`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `P-ci-T-fe-fix`                    | P-ci-T-discover                                                     | PG-ci-scaffold |
| **libs/ appears** (packages→libs)               | `_discover-units.yml`                                                                                                                                                                   | `emit libs` already present from scaffold → no edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | covered                            | —                                                                   | —              |
| same                                            | all per-lib `*-quality.yml` + `_pkg-check.yml`                                                                                                                                          | **delete**; `unit-quality.yml` matrix covers libs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `P-ci-T-libs`                      | P-ci-T-discover, P2 (lib moves)                                     | PG-ci-fold     |
| same                                            | `quality.yml`, `format-drift-watchdog.yml`, `infra-lint.yml`, `workflows-quality.yml`                                                                                                   | verify path-agnostic; add `isolation:check` to `quality.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `P-ci-T-iso`                       | 04 isolation scripts                                                | PG-ci-fold     |
| **module-registry dissolved**                   | `module-registry-quality.yml`                                                                                                                                                           | **delete** (kills last turbo invocation; `registry:build`/`generated.ts` gone)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `P-ci-T-registry`                  | RD-5 (`04`/hotspots)                                                | —              |
| **frontends finalize home** (`pillars/<x>/app`) | `fe-quality.yml`                                                                                                                                                                        | **KEEP** as the dedicated `app-*` gate (disk-discover `pillars/*/app` via its own scan, since `_discover-units` stops at `maxdepth 1` and the seven `app/` dirs name-collide); confirm globs watch `pillars/*/app/**`. Do NOT fold into `unit-quality` — `app-*` are source-bundled frontends, not standalone units.                                                                                                                                                                                                                                                                                                                                                                                                  | `P-ci-T-fe-final`                  | P-ci-T-fe-fix, app-pillar moves                                     | PG-ci-fe       |
| same                                            | `storybook-quality.yml`                                                                                                                                                                 | **delete** (storybook folds into `libs/ui` dev surface → covered by ui's unit-quality)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `P-ci-T-storybook`                 | storybook fold (`02` R3-T06)                                        | PG-ci-fe       |
| same                                            | `pillar-schema-coverage.yml`                                                                                                                                                            | no edit (already disk-discovered `pillars/*/src/db/**`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                  | —                                                                   | —              |
| **shell/mcp/orch/docs/moltbot → pillars**       | `publish-images.yml`                                                                                                                                                                    | delete static `apps:` job; all flow through pillar matrix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `P-ci-T-publish`                   | app-pillar moves, Dockerfile path edits (`02`)                      | PG-ci-images   |
| same                                            | `docker-build.yml`                                                                                                                                                                      | replace hard-coded `apps/pops-shell`,`apps/pops-mcp` with `pillars/*/Dockerfile` loop only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `P-ci-T-docker`                    | app-pillar moves                                                    | PG-ci-images   |
| same                                            | fix `apps/pops-mcp/Dockerfile` no-`--filter` bug (now `pillars/mcp/Dockerfile`)                                                                                                         | `pnpm install --frozen-lockfile --filter "@pops/mcp..."` + scoped COPYs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `P-ci-T-mcp-fix`                   | mcp move (`02`)                                                     | PG-ci-images   |
| same                                            | new `moltbot-config.yml`                                                                                                                                                                | add dedicated job `on: pull_request: paths: ['pillars/moltbot/**']` running `pillars/moltbot/scripts/validate-config.sh` (moltbot is manifest-less → invisible to `unit-quality`; this is its only CI gate)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `P-ci-T-moltbot`                   | moltbot move (`02`)                                                 | PG-ci-images   |
| **rust units → libs/**                          | `rust-quality.yml`                                                                                                                                                                      | path globs `crates/**`→`libs/pops-{ai,settings}/**` + rust pillars; point `working-directory` at relocated root `Cargo.toml`; add cargo-deny + `check-cargo-deps.mjs` (`04`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `P-ci-T-rust`                      | rust move (`02` R2), 04 RUST-\*                                     | PG-ci-rust     |
| **deploy go-live**                              | re-enable `push:main` on `publish-images.yml` + `release.yml`; add `deploy-gate.yml`; provision `TS_OAUTH_*`                                                                            | new `deploy-gate.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `P-deploy-T-gate`                  | P-ci-T-publish, P-ci-T-mcp-fix, all pillars `POPS_REGISTRY_ENABLED` | PG-deploy      |
| same                                            | drop orphan secrets (`finance_api_key`, `up_bank_token`, `up_webhook_secret`, `notion_api_token`, `tmdb_api_key`, `thetvdb_api_key`) — **coupled compose edit**, not standalone cleanup | These six are declared in the top-level `secrets:` stanza of `infra/docker-compose.yml` AND `.dev.yml` (each `file: ../secrets/<name>`) but referenced by **no service** (verified). The `docker-build.yml` stub creates those files solely so `docker compose config -q` (a validation step in that same workflow) passes. Removing only the stub-file creation → `docker compose config` FAILS on the missing files. So in ONE PR: remove each from the compose `secrets:` stanza in BOTH compose files, remove its stub-file creation in `docker-build.yml`, and delete the GH secret. Before deleting, re-verify no service consumes them (a future integration may rewire one) — if live, do NOT call it orphan. | `P-deploy-T-secrets`               | —                                                                   | PG-deploy      |
| **POPS_PILLARS demote**                         | `infra/docker-compose.yml` (+`.dev.yml`)                                                                                                                                                | gate green proves safe → default `${POPS_PILLARS:-}`; keep parser as operator escape hatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `P-deploy-T-pops-pillars`          | P-deploy-T-gate green, RD-7/RD-8 (hotspots)                         | PG-deploy      |
| **e2e rewrite**                                 | `fe-test-e2e.yml` + new `infra/docker-compose.e2e.yml`                                                                                                                                  | rewrite head per section D; add smoke as required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `P-e2e-T-rewrite`                  | P-ci-T-publish (image availability), REST contracts stable          | PG-e2e         |
| **legacy-path drop**                            | `wait-registration.mjs`                                                                                                                                                                 | drop `--accept-legacy-path` after ai + contacts extract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `P-deploy-T-legacy-drop`           | ai + contacts extraction                                            | —              |

`docs:`/`paths-ignore` on `quality.yml` is preserved everywhere to keep the docs-only ≤4-checks property.

---

## F. Per-task acceptance / verify / rollback templates

Every `P-ci-*` / `P-deploy-*` / `P-e2e-*` task carries this shape.

### `P-ci-T-discover` (add `_discover-units.yml` + `unit-quality.yml`, shadow)

- **Scope:** add reusable discovery + generalized matrix; do NOT add to required checks yet.
- **Files:** `.github/workflows/_discover-units.yml` (new), `.github/workflows/unit-quality.yml` (new).
- **Depends-on:** `P0-T-ci`. **Parallel-group:** PG-ci-scaffold.
- **Acceptance:**
  - [ ] `gh workflow run unit-quality.yml` lists every current pillar + lib in the matrix names.
  - [ ] every emitted unit's `pkg` resolves to exactly one workspace package: `for u in $(jq -r '.[].pkg' <units>); do [ "$(pnpm ls -r --depth -1 --filter "$u" --json | jq length)" = 1 ]; done` (catches the `libs/sdk`→`@pops/pillar-sdk` dir≠pkg skew).
  - [ ] discovery emits `pkg` distinct from `name` for `libs/sdk` (`@pops/pillar-sdk`) and `libs/settings` (`@pops/pillar-settings`); the `--filter`/`-p` steps reference `pkg`, never `@pops/${name}`.
  - [ ] `app-*` (`pillars/*/app`) and `moltbot` do NOT appear in the matrix (out of scope; covered by `fe-quality.yml` / `moltbot-config.yml`).
  - [ ] a no-op PR (whitespace in one unit) runs only that unit's matrix leg.
  - [ ] a `pnpm-lock.yaml` change runs the full unit set.
  - [ ] workflow is NOT in the branch ruleset required-checks list.
- **Verify:** `act pull_request -W .github/workflows/unit-quality.yml` (or push a probe branch); `gh run list --workflow unit-quality.yml`.
- **Rollback:** `git rm .github/workflows/{_discover-units,unit-quality}.yml`.

### `P-ci-T-libs` (delete per-lib workflows, promote matrix)

- **Scope:** delete `_pkg-check.yml` + per-lib `*-quality.yml`; promote `unit-quality` to required.
- **Files:** delete `.github/workflows/{_pkg-check,ui-quality,navigation-quality,db-types-quality,ai-telemetry-quality,pillar-settings-quality,module-registry-quality,ai-quality,orchestrator-quality,storybook-quality}.yml` (module-registry/storybook may defer to their own coupled tasks); ruleset update.
- **Depends-on:** `P-ci-T-discover`, `02` lib-move wave. **Parallel-group:** PG-ci-fold.
- **Acceptance:**
  - [ ] each deleted lib appears as a green leg in `unit-quality` on the same PR (`gh run view`).
  - [ ] required-checks list contains `unit-quality` lanes, not the deleted per-lib names.
  - [ ] no `turbo run` remains in any `.github/workflows/*.yml` (`grep -rL` empty).
- **Verify:** `! grep -rn 'turbo run' .github/workflows/`; `gh pr checks <pr> | grep unit-quality`.
- **Rollback:** `git revert` (restores per-lib workflows + ruleset).

### `P-deploy-T-gate` (deploy gate go-live)

- **Scope:** re-enable `push:main` publish; add `deploy-gate.yml`; staging→main promotion.
- **Files:** `.github/workflows/{publish-images,release}.yml` (re-enable `push:main`), `.github/workflows/deploy-gate.yml` (new), `scripts/ci/wait-registration.mjs` (new, shared w/ E2E), GH secrets `TS_OAUTH_ID`/`TS_OAUTH_SECRET`.
- **Depends-on:** `P-ci-T-publish`, `P-ci-T-mcp-fix`, all pillars shipping `POPS_REGISTRY_ENABLED=true`. **Parallel-group:** PG-deploy.
- **Acceptance:**
  - [ ] a one-pillar merge publishes only that pillar's image (`gh run view` matrix has 1 leg).
  - [ ] `:staging` rolls on staging Watchtower; pillar appears in core `/registry` with `build==head_sha`.
  - [ ] gate retags `:sha-* → :main`; prod Watchtower rolls within 60s; `/health` 200.
  - [ ] gate FAILS (no promote) when a pillar does not register within `--timeout`.
- **Verify:** `node scripts/ci/wait-registration.mjs --registry http://core-api:3001 --units '[{"name":"finance","kind":"pillar"}]' --expect-sha $(git rev-parse HEAD)`; `docker buildx imagetools inspect ghcr.io/knoxio/pops-finance:main`.
- **Rollback:** `docker buildx imagetools create --tag ghcr.io/knoxio/pops-finance:main ghcr.io/knoxio/pops-finance:sha-<prev>`; disable `deploy-gate.yml` (`gh workflow disable`).

---

## G. Key findings / risks (flag to planner)

| #   | Risk                                                                                                                                                                                                                                                                                                                                                                                                 | Action                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `fe-quality.yml` + `storybook-quality.yml` watch deleted `packages/app-*/**` and miss `pillars/*/app/**` → **FE changes silently skip the gate TODAY**                                                                                                                                                                                                                                               | `P-ci-T-fe-fix` lands EARLY, before frontend relocation                                                                                                                                                                                                                                                                                       |
| R2  | `module-registry-quality.yml` is the **only** remaining `turbo` invocation in CI                                                                                                                                                                                                                                                                                                                     | dropping turbo (LOCKED) requires this workflow's deletion coupled with module-registry dissolution (`P-ci-T-registry`)                                                                                                                                                                                                                        |
| R3  | Registration gate makes `POPS_PILLARS` dead config, but compose default still wired in                                                                                                                                                                                                                                                                                                               | order: gate green (`P-deploy-T-gate`) → demote default (`P-deploy-T-pops-pillars`)                                                                                                                                                                                                                                                            |
| R4  | `apps/pops-mcp/Dockerfile` runs `pnpm install` with no `--filter`                                                                                                                                                                                                                                                                                                                                    | fix in `P-ci-T-mcp-fix` BEFORE re-enabling `push:main` publish, else first auto-deploy breaks                                                                                                                                                                                                                                                 |
| R5  | `docker/*-action` version drift (`@v6`/`@v7`)                                                                                                                                                                                                                                                                                                                                                        | normalize/pin in the discovery-rework PR                                                                                                                                                                                                                                                                                                      |
| R6  | Deploy gate needs Tailnet reach to core-api                                                                                                                                                                                                                                                                                                                                                          | **DECIDED:** `tailscale/github-action@v3` (`TS_OAUTH_*`) on a GH-hosted runner (ephemeral tailnet join); self-hosted on capivara deferred as a future optimization                                                                                                                                                                            |
| R7  | Rust per-unit vs workspace: `rust-quality.yml` builds whole workspace                                                                                                                                                                                                                                                                                                                                | move to `cargo -p <pkg>` in matrix keeps single lockfile but enables changed-only; verify `Cargo.toml` `members` paths updated when crates move to `libs/` (`02`). Crate name == dir basename for `pops-ai`/`pops-settings`/`contacts` today (verified), but the matrix selects on the emitted `pkg` (crate `[package].name`) for robustness. |
| R8  | App-pillar build-script gap (shell/mcp source-bundled)                                                                                                                                                                                                                                                                                                                                               | per-unit `mise.toml` task presence + `if lang==ts` guard no-ops missing scripts; verify each app-pillar `mise.toml` (`03`)                                                                                                                                                                                                                    |
| R9  | **Dir-name ≠ pkg-name silent miss.** `libs/sdk`=`@pops/pillar-sdk`, `libs/settings`=`@pops/pillar-settings` (LOCKED, names unchanged). `pnpm --filter @pops/sdk` matches zero packages and **exits 0**, so a selector derived from the directory basename would silently run nothing → those units unguarded, and a job named `sdk` still appears in the matrix so a coverage audit wouldn't notice. | Discovery emits `pkg` (= `package.json#name`) as a field distinct from `name`; all `--filter`/`-p` steps use `pkg`; `unit-quality` fails if `--filter <pkg>` doesn't match exactly one package.                                                                                                                                               |
| R10 | **moltbot + app-\* invisible to `_discover-units`.** moltbot is manifest-less (`continue`d); `app-*` live at `pillars/*/app` below `maxdepth 1` and name-collide on basename `app`. Both silently uncovered if assumed in `unit-quality`.                                                                                                                                                            | moltbot → dedicated `moltbot-config.yml` (`P-ci-T-moltbot`); `app-*` → `fe-quality.yml` kept as their gate (`P-ci-T-fe-final`). `unit-quality` notes explicitly exclude both.                                                                                                                                                                 |

---

## Relevant paths (absolute)

- `/Users/joao/dev/personal/pops/.github/workflows/{quality,pillar-quality,pillar-schema-coverage,publish-images,docker-build,fe-quality,fe-test-e2e,release,rust-quality,_pkg-check,module-registry-quality,ui-quality,navigation-quality,db-types-quality,ai-telemetry-quality,pillar-settings-quality,ai-quality,orchestrator-quality,storybook-quality}.yml`
- `/Users/joao/dev/personal/pops/.github/scripts/release.sh`
- `/Users/joao/dev/personal/pops/scripts/check-pillar-schema-coverage.mjs` (repo-meta tooling home; new `scripts/ci/*` lives alongside)
- `/Users/joao/dev/personal/pops/infra/docker-compose.yml` (Watchtower, `POPS_PILLARS`, contacts self-reg), `+.dev.yml`, new `infra/docker-compose.e2e.yml`
- `/Users/joao/dev/personal/pops/packages/pillar-sdk/src/bootstrap/register.ts` → post-move `libs/sdk/src/bootstrap/register.ts`
- `/Users/joao/dev/personal/pops/pillars/contacts/src/registry/lifecycle.rs`
- `/Users/joao/dev/personal/pops/pillars/core/src/api/pillars/registry.ts`, `/Users/joao/dev/personal/pops/pillars/core/src/api/modules/registry/snapshot.ts`
- `/Users/joao/dev/personal/pops/apps/moltbot/scripts/validate-config.sh` → post-move `pillars/moltbot/scripts/validate-config.sh` (moltbot is config-only: no `package.json`/`Cargo.toml`; gated by `moltbot-config.yml`, not `unit-quality`)
- New: `scripts/ci/{wait-registration,changed-units,check-contract-isolation,check-lib-no-pillar-import,agent-review}.mjs`, `.github/workflows/{_discover-units,unit-quality,agent-review,deploy-gate,moltbot-config}.yml`
