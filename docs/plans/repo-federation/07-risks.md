# 07 — Risk Register, Rollback Strategy & Parallel-Agent Failure Modes

Repo: `/Users/joao/dev/personal/pops` @ `fb56d4d0` (main). Owner-task cells reference the **canonical executable backlog**: relocation/config/build phases `P0-T*`…`P7-T*` (`03-execution-phases.md`), CI/deploy `P-ci-T-*`/`P-deploy-T-*`/`P-e2e-T-*` (`05-cicd-deployment.md`), registry decoupling `RD-*` (`06`), isolation `ISO-*`/`EX-*` (`04`). (The `R*-T*`/`C-T*`/`G-T*` labels in the `01`/`02` analysis docs are the design-doc scheme; `03`/`05` are the IDs an executor runs against — these are the ones cited below.)

This file is the **stop-the-line authority**. Any agent hitting a row marked `HALT` aborts its task, posts the failure on the PR, and does not merge.

---

## 1. Risk Register

Likelihood / Impact: **L** low · **M** medium · **H** high. Owner-task is the task that _carries the mitigation_ (must implement the guard, not just be aware of it).

| #     | Risk                                                                                                                                                                                                                                                                                                              | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                    | Owner-task                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| RK-01 | **`pnpm-lock.yaml` race** — parallel relocation PRs (P2-T01 libs ∥ P2-T02 app→pillar ∥ P2-T04 storybook) each rewrite lockfile `importers:` keys → merge conflict + `--frozen-lockfile` CI failure on the loser.                                                                                                  | H          | H      | Wave-batch: **one PR per lane** (PG-LIBS=all lib moves, PG-APPS=all app→pillar moves). Lanes touch different lockfiles (`pnpm-lock.yaml` vs `Cargo.lock`) so PG-LIBS ∥ PG-APPS ∥ PG-RUST is genuinely 3-wide, zero lock contention. A task may edit `pnpm-lock.yaml` only if `parallel-group` size == 1.                                                                                                      | P2-T01, P2-T02 (lane-batch), §3 guard G-LOCK |
| RK-02 | **`pnpm-workspace.yaml` half-edit** — G0 adds `libs/*` but a move lands before G0 merges → moved unit unresolved, mass `ERR_PNPM_NO_MATCHING_VERSION`.                                                                                                                                                            | M          | H      | G0 is a **hard serial gate**: no R-wave PR opens until G0 is merged to main. Globs kept **additive** (`apps/*`+`packages/*`+`libs/*` simultaneously) until G1, so a unit resolves whether in old or new home. G1 (strip old globs) is a serial gate _after_ all R-waves merge.                                                                                                                                | P1-T01 (G0), P3-T01 (G1)                     |
| RK-03 | **`crates/Cargo.toml` members race** — a split rust move would have two PRs both edit `members` + `Cargo.lock`.                                                                                                                                                                                                   | M          | M      | Rust moves are **serial within the lane (PG-RUST size 1)** — single PR moving both crates + relocating workspace root + fixing member rel-paths. cargo member edits never collide with TS lock.                                                                                                                                                                                                               | P2-T03                                       |
| RK-04 | **Dockerfile `COPY` path rot** — moved-app/pillar Dockerfiles still `COPY packages/<lib>` after libs move to `libs/`; the `pillar-sdk→sdk`/`pillar-settings→settings` **dir rename** changes the COPY path even though npm name is unchanged → image build fails only when published (push:main), not in unit CI. | H          | H      | P4-T07 sweeps all 13 Dockerfiles; acceptance requires a local `docker build --target builder` for finance + contacts + shell **before** merge. publish-images stays `workflow_dispatch` until P4-T07 + docker-build.yml green (re-enable `push:main` only in P-deploy-T-gate).                                                                                                                                | P4-T07, P-ci-T-publish                       |
| RK-05 | **`tsc -b` graph wrong/missing** — root `tsconfig.build.json` references graph is **net-new** (D7: no references exist today). Wrong edge ordering → clean `tsc` fails finding `@pops/types` dist; missing `composite:true` → "referenced project may not disable emit".                                          | M          | H      | Land `tsc -b` + `composite` + root solution file with the post-move `libs/`+`pillars/` paths and prove green (P5-T01, the first Phase-5 step, after the relocation lands). Verify `tsc -b --dry --verbose` lists every compiled unit in topo order.                                                                                                                                                           | P5-T01                                       |
| RK-06 | **turbo removed before mise replacement proven** — drop `turbo.json` while a workflow still calls `turbo run` (only `module-registry-quality.yml` does) → that workflow 127-exits.                                                                                                                                | M          | M      | `turbo` devDep + `turbo.json` deleted **only in the same PR** that deletes `module-registry-quality.yml`'s turbo invocation. Grep gate: `! git grep -n 'turbo' -- '*.yml' package.json` must be empty before P5-T05 merges.                                                                                                                                                                                   | P5-T05, P-ci-T-registry                      |
| RK-07 | **FE CI silent hole persists** — `fe-quality.yml`/`storybook-quality.yml` globs already watch deleted `packages/app-*/**` and miss `pillars/*/app/**` (live bug today). FE changes skip the gate through the whole migration.                                                                                     | H          | M      | Land P-ci-T-fe-fix **early** (before frontend logic changes), independent of relocation, since pillars/\*/app already exists on main. Acceptance: a no-op edit to `pillars/finance/app/src/index.ts` triggers a FE check on a draft PR.                                                                                                                                                                       | P-ci-T-fe-fix, P4-T04                        |
| RK-08 | **New app-pillars break `pillar-quality` matrix** — shell/mcp/orchestrator/docs land under `pillars/` and auto-enroll in disk-discovery, but have **no `build` script** (FE-bundled) → matrix `pnpm --filter @pops/<x> build` fails.                                                                              | M          | H      | `unit-quality.yml` uses `build \|\| true` for source units + lang/kind split; the new app-pillars get typecheck/lint/test in the matrix and `build` only in the shell job. Add a build-script guard before re-enabling discovery for them.                                                                                                                                                                    | P-ci-T-discover, P5-T04                      |
| RK-09 | **module-registry ISO-R1 violation blocks CI** — `libs/module-registry` importing pillars is a hard `error`, but the runtime-discovery replacement (RD-3) isn't done yet.                                                                                                                                         | H          | M      | Grandfather the **existing** edges as a single baseline entry in `.dependency-cruiser-known-violations.json`; ISO-R1 is `error` for _new_ code immediately (baseline only covers current edges). `baseline-guard.sh` (EX-3) forbids growth. Entry deleted when RD-3+RD-1 land.                                                                                                                                | ISO-R1, RD-1, RD-3, EX-3                     |
| RK-10 | **`KnownPillarId → string` (RD-9) ripple** — widening the union touches every `isModuleId`/`ModuleId` call site; a missed dispatch path silently mis-routes a pillar.                                                                                                                                             | L          | H      | Isolate as a single late PR, gated behind RD-3 (no runtime dispatch depends on the union by then). Full `pnpm -r test` + e2e-smoke required. Do not bundle with any move.                                                                                                                                                                                                                                     | RD-9                                         |
| RK-11 | **mcp Dockerfile `pnpm install` with no `--filter`** (audit) — broken/bloated build surfaces only on first `push:main` auto-deploy.                                                                                                                                                                               | M          | M      | Fix to the finance pattern (`--frozen-lockfile --filter "@pops/mcp..."`) in P-ci-T-mcp-fix, after the mcp move (P2-T02). Block re-enabling publish `push:main` (P-deploy-T-gate) until mcp image builds locally.                                                                                                                                                                                              | P-ci-T-mcp-fix, P-deploy-T-gate              |
| RK-12 | **`POPS_PILLARS` premature emptying** — RD-8 empties the seed before all pillars reliably self-register at cold start → cross-pillar call hits a not-yet-registered pillar.                                                                                                                                       | M          | H      | RD-8 gated on: all node pillars + contacts ship `POPS_REGISTRY_ENABLED=true` **and** `external-pillar-e2e` cold-start test green **and** `wait-registration.mjs` proves the mesh self-assembles. Keep env _parser_ as escape hatch. First fix the stale seed (RD-7), only later empty it.                                                                                                                     | RD-7, RD-8                                   |
| RK-13 | **Migration-before-image ordering** — a PR bumps a pillar's schema + a downstream consumer; consumer image promotes before producer applies migrations → boots against missing table.                                                                                                                             | L          | H      | Deploy gate sequences: consumer promotion `depends-on` producer promotion (`deploy-after` task metadata). `wait-registration.mjs` asserts `schema_version >= image_expected` before promote.                                                                                                                                                                                                                  | P-deploy-T-gate                              |
| RK-14 | **Extraction window transport mismatch** — freshly-extracted Rust pillar (contacts) hits legacy `/core.registry.*` path; gate reports unregistered → blocks own promotion.                                                                                                                                        | L          | M      | `wait-registration.mjs --accept-legacy-path` during the extraction window; drop the flag once ai + contacts extractions land.                                                                                                                                                                                                                                                                                 | P-deploy-T-gate                              |
| RK-15 | **CI flakiness undermines auto-merge** — non-deterministic test/e2e failure auto-blocks or (worse) a retry masks a real regression.                                                                                                                                                                               | M          | M      | No blanket retries on unit tests (a flake is a bug — fix root cause per Playwright rule). E2e-smoke uses Playwright auto-waiting + `wait-registration.mjs` (deterministic signal), **no fixed timeouts**. Quarantine lane for known-flaky, never on the required path.                                                                                                                                        | P-e2e-T-rewrite, P-ci-T-review               |
| RK-16 | **Deploy gate can't reach core on Tailnet** — GH-hosted runner has no route to capivara core-api → `wait-registration.mjs` times out, blocks every promotion.                                                                                                                                                     | M          | H      | **DECIDED:** `tailscale/github-action@v3` with `TS_OAUTH_*` secrets on a GH-hosted runner (self-hosted on capivara = deferred fallback). Validate connectivity in a shadow run before making the gate required.                                                                                                                                                                                               | P-deploy-T-gate                              |
| RK-17 | **docker-action version drift** — `build-push-action@v6` vs `@v7`, `metadata-action@v6` across workflows → inconsistent behavior / cache misses.                                                                                                                                                                  | L          | L      | Normalize to `@v7` (pin) in the docker-publish rework; grep gate `git grep 'build-push-action@v6'` empty.                                                                                                                                                                                                                                                                                                     | P-ci-T-docker, P-ci-T-publish                |
| RK-18 | **Dead secrets leak / confuse** — `finance_api_key` + 5 orphan integration secrets (up_bank_token, up_webhook_secret, notion_api_token, tmdb_api_key, thetvdb_api_key) referenced in docker-build stub.                                                                                                           | L          | L      | Remove from `docker-build.yml` stub + GH secret store; grep gate for each name empty.                                                                                                                                                                                                                                                                                                                         | P-deploy-T-secrets                           |
| RK-19 | **Exports-map leak** — a pillar without a `files` whitelist lets a consumer `import '@pops/finance/src/db'`; isolation rule becomes lint-opinion not hard error.                                                                                                                                                  | M          | M      | ISO-EXPORTS: every pillar adds `files: ["dist/contract/**", ...]` (finance is the gold standard). `scripts/check-exports.mjs` asserts no `exports` target outside `files`/`dist`.                                                                                                                                                                                                                             | ISO-EXPORTS, ISO-R3                          |
| RK-20 | **overlay-ego mis-placement** — left in `pillars/cerebrum` forces shell→cerebrum-contract for a chat widget (dependency inversion).                                                                                                                                                                               | L          | M      | Classify as **LIB** → `libs/overlay-ego` (or `libs/ego-ui`). Consumers import by `@pops/overlay-ego` name → zero importer edits. The `git mv` rides in the TS lib-move PR (P2-T01); the depcruise scope edit folds into P4-T01.                                                                                                                                                                               | P2-T01, P4-T01                               |
| RK-21 | **Relocation PR too large to review** — the federation pivot lands as relocation lanes; a bad merge poisons main for all downstream parallel work.                                                                                                                                                                | M          | H      | Split into three lane-scoped solo PRs by lockfile (P2-T01 TS libs, P2-T02 app→pillar, P2-T03 rust) bracketed by the additive-glob gate (P1-T01) → `git mv` → `pnpm install`/`cargo metadata` → glob close (P3-T01). Each lane is a within-lane barrier; the three run concurrently (distinct lockfiles). Full local gate (§2 commands) green before push; resume Phase-4 parallelism only after P3-T01 lands. | P2-T01, P2-T02, P2-T03                       |

---

## 2. Rollback Strategy per Phase

Every phase rolls back to **the last green commit on main**. Because all relocations are package-name-based, a `git revert` of a move PR + `pnpm install` restores resolution with no importer edits. The full local gate that must pass before _any_ push (and that reproduces the required checks):

```bash
pnpm install --frozen-lockfile \
  && pnpm lint \
  && pnpm format:check \
  && pnpm lint:boundaries \
  && pnpm -r typecheck \
  && pnpm -r test
cargo build --workspace && cargo test --workspace   # when rust touched
```

| Phase                                                          | Forward gate (must be green to merge)                                                                 | Rollback action                                                                                           | Blast radius if it lands broken                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **P0** working-tree cleanup (P0-T01/T02)                       | `pnpm lint:boundaries` (1404 modules, 0 violations), `format:check`, `lint` exit 0                    | `git revert <P0-T01-sha>`                                                                                 | repo-meta only; no units move                                                        |
| **G0** add `libs/*` glob (P1-T01)                              | `pnpm install` resolves; existing units unmoved                                                       | `git revert <P1-T01-sha>` (glob is additive, revert is safe)                                              | none — additive glob matches nothing new yet                                         |
| **R1** TS lib moves (P2-T01, 1 PR)                             | full local gate + `pnpm --filter <each> typecheck`                                                    | `git revert <P2-T01-sha>` + `pnpm install` (symlinks restore)                                             | all libs unresolved until revert; revert is mechanical                               |
| **R2** rust moves (P2-T03, 1 PR)                               | `cargo build --workspace && cargo test --workspace`; `cargo metadata` resolves new member paths       | `git revert <P2-T03-sha>` + `cargo metadata`                                                              | rust lane only (separate lockfile)                                                   |
| **R3** app→pillar + storybook fold + cli drop (P2-T02, P2-T04) | full local gate + `docker build --target builder` shell                                               | `git revert <P2-T02-sha>` + `pnpm install`; cli-drop revert restores `apps/pops-cli`                      | shell/mcp/orchestrator/docs unresolved until revert                                  |
| **G1** strip old globs + rm empty dirs (P3-T01)                | full local gate (lockfile + final globs agree)                                                        | `git revert <P3-T01-sha>` (re-adds globs, un-rm via revert)                                               | install fails if any unit still in old dir — caught locally                          |
| **Phase 4** config retarget (P4-T01…T07, file-disjoint)        | per-file: relevant workflow runs green; docker builds for P4-T07                                      | `git revert <P4-Tnn-sha>` per file independently                                                          | one config surface per revert; isolated                                              |
| **Phase 5** build model (tsc-b, mise, de-turbo: P5-T01…T05)    | `tsc -b tsconfig.build.json` topo-green; `mise run build/test/typecheck` parity with old turbo output | revert in reverse: P5-T05→P5-T03→P5-T01; keep turbo as fallback until P5-T05                              | build orchestration; turbo-removal is the irreversible step, gate hardest            |
| **RD-\*** registry decoupling                                  | `pnpm -r test` + e2e-smoke; RD-3 behind existing `RegistryEntry` seam                                 | `git revert <RD-sha>`; RD-3/RD-9 each isolated                                                            | runtime boot source (RD-3) and type union (RD-9) are highest-risk; revert each alone |
| **Deploy go-live** (P-deploy)                                  | shadow run green; `wait-registration.mjs` proves self-assembly; staging ring converges                | **retag** `:main` → previous good `sha-*` digest (one `imagetools create`); Watchtower rolls back in ≤60s | production pillars; promotion is a retag so rollback is a retag                      |

**Deploy rollback command (per pillar, the canonical kill-switch):**

```bash
docker buildx imagetools create \
  --tag ghcr.io/knoxio/pops-<unit>:main \
  ghcr.io/knoxio/pops-<unit>:sha-<previous-good-short-sha>
# production Watchtower (POLL_INTERVAL=60, WATCHTOWER_ROLLING_RESTART=true) pulls within 60s
```

Each deploy task's `rollback:` field is exactly this with the prior SHA pinned.

---

## 3. Parallel-Agent Failure Modes & Concrete Guards

Each guard is a runnable check an agent executes (pre-push or in CI). `HALT` = abort task, do not merge.

### FM-1 — Worktree conflicts (two agents, overlapping files)

**Symptom:** merge conflict on a shared file two tasks both edited; or one agent's worktree builds against another's un-merged change.

**Guards:**

```bash
# G-WT: before opening a PR, assert no shared-config file was touched outside this task's declared set.
# The conflict matrix (analysis §e) lists every serializing file. A task touching a row with ≥2 ✗
# in its wave MUST be parallel-group size 1.
git -C "$WORKTREE" diff --name-only origin/main \
  | grep -E '^(pnpm-workspace\.yaml|pnpm-lock\.yaml|crates/Cargo\.toml|Cargo\.lock|\.dependency-cruiser\.cjs|turbo\.json|tsconfig\.build\.json|package\.json)$' \
  && echo "HALT: task touches a serializing shared file — must be parallel-group=1" && exit 1 || true
```

- One task = one worktree = one branch off main (`git worktree add ../pops-wt/<TASKID> -b feat/<TASKID> main`).
- Shared-config files (matrix rows) are **owned by exactly one task per wave**. Phase-C tasks are each scoped to **one distinct file** → 7-wide parallel with zero overlap by construction.
- Worktree teardown only after merge: `git worktree remove ../pops-wt/<TASKID>`.

### FM-2 — Half-merged shared-config edits (interleaved partial state)

**Symptom:** `pnpm-workspace.yaml` says `libs/*` but a unit is still in `packages/`; or lockfile and globs disagree → `--frozen-lockfile` fails mid-wave.

**Guards:**

```bash
# G-CONSISTENCY: lockfile ↔ workspace ↔ disk must agree on the PR head before push.
pnpm install --frozen-lockfile || { echo "HALT: lockfile disagrees with workspace/disk"; exit 1; }
# G-GLOB: during migration keep globs ADDITIVE (old+new). Never push an intermediate where
# committed lockfile and committed globs disagree. Strip old globs only in the FINAL commit of G1.
```

- Serial gates G0 (add) and G1 (strip) are the only edits to `pnpm-workspace.yaml`; they never run concurrently with a move.
- Additive-glob invariant: a unit resolves whether it sits in `packages/` or `libs/` for the entire window between G0 and G1.

### FM-3 — Lockfile races (RK-01, the dominant limiter)

**Symptom:** two relocation PRs both rewrite `pnpm-lock.yaml` importer keys → second PR's `--frozen-lockfile` CI fails after rebase.

**Guards:**

```bash
# G-LOCK: only a parallel-group=1 task may modify pnpm-lock.yaml.
if git diff --name-only origin/main | grep -q '^pnpm-lock\.yaml$'; then
  test "$PARALLEL_GROUP_SIZE" -eq 1 || { echo "HALT: lockfile edit requires parallel-group=1"; exit 1; }
fi
```

- **Strategy: wave-batch.** PG-LIBS (P2-T01, all TS lib moves) = 1 PR; PG-APPS (P2-T02, all app→pillar) = 1 PR; PG-RUST (P2-T03, rust) = 1 PR. Across-lane parallelism (TS lock vs Cargo lock) is contention-free; intra-lane parallelism is sacrificed deliberately.
- Never run two lock-touching PRs against the same lockfile concurrently. The discovery/CI matrices that read disk (`pillar-quality`, `_discover-units`) never touch the lockfile and parallelize freely.

### FM-4 — CI flakiness (RK-15) eroding green-before-next

**Symptom:** intermittent failure auto-blocks a good PR, or a silent retry hides a real regression.

**Guards:**

- **No fixed Playwright/test timeouts** — rely on auto-waiting + `wait-registration.mjs` deterministic registry signal. A test needing a long wait is a bug, fix the root cause.
- **No blanket retries** on unit tests in the required path. A flaky test is quarantined to a non-required lane and filed as an issue, never silently retried green.
- **Shadow-then-promote:** every new workflow runs `continue-on-error` / non-required for one green-on-main cycle before becoming a required check (ruleset `strict_required_status_checks_policy: false` lets non-triggered checks not block).
- **Local-gate parity:** the pre-push command set (§2) is byte-identical to the required checks, so "green locally → green in CI" holds; if CI fails after a green local gate, treat it as flakiness or environment drift and HALT (do not retry-merge).

### FM-5 — Coverage gap when deleting old CI (per-lib `*-quality.yml`)

**Symptom:** old `<lib>-quality.yml` deleted but new `unit-quality.yml` matrix doesn't actually cover that unit → silent unguarded unit.

**Guard:**

```bash
# G-COVERAGE: delete an old per-lib workflow only in the SAME PR that proves the matrix covers it.
gh run view <run-id> --json jobs -q '.jobs[].name' | grep -q "<unit> (lib)" \
  || { echo "HALT: unit-quality matrix does not yet list <unit>; do not delete its workflow"; exit 1; }
```

### FM-6 — Isolation regression slipping through parallel PRs

**Symptom:** a parallel agent introduces a new cross-contract reach (`@pops/finance/src/db`) or a lib→pillar import while another is mid-decoupling.

**Guards:**

```bash
# Run as required `agent-review` check + locally before push:
pnpm run isolation:check   # = lint:boundaries + check-exports + baseline-guard + EX-1 over changed units
# baseline monotonicity — grandfathered violations may only shrink:
bash scripts/extractability/baseline-guard.sh   # HALT if .dependency-cruiser-known-violations.json grew
```

- ISO-R1..R4 are `error` for new code from day one; the baseline only grandfathers existing edges (module-registry). EX-3 forbids the baseline growing → no parallel agent can add a violation.

### FM-7 — Auto-merge merging on stale base

**Symptom:** PR auto-merges while behind main; a serializing change landed in between → broken main.

**Guards:**

- Ruleset `required_linear_history` → squash + branch-must-be-up-to-date-with-main before auto-merge fires (`gh pr merge --auto --squash`).
- Auto-merge conditions: all required checks green **and** CodeRabbit not `CHANGES_REQUESTED` **and** `agent-review` pass **and** ≥1 approving review **and** branch current. No green-on-stale merges.

---

## 4. Phase-Boundary HALT Conditions (quick reference)

| Boundary                                               | HALT unless                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Open any relocation PR (P2-T01/T02/T03)                | G0 (P1-T01) merged to main; globs additive                                                         |
| Merge any lock-touching PR                             | `parallel-group=1`; `pnpm install --frozen-lockfile` green locally                                 |
| Merge G1 (P3-T01)                                      | all relocation lanes merged; empty `apps/`/`packages/`/`crates/`; lockfile↔globs agree             |
| Merge P5-T05 (remove turbo)                            | `git grep turbo` empty across `*.yml` + `package.json`; mise parity proven                         |
| Delete a `*-quality.yml` (P-ci-T-libs)                 | `unit-quality` matrix run shows the unit's job                                                     |
| Re-enable `publish-images` push:main (P-deploy-T-gate) | P4-T07 done; mcp Dockerfile fixed (P-ci-T-mcp-fix); finance+contacts+shell images build locally    |
| Empty `POPS_PILLARS` (P7-T06 / RD-8)                   | `external-pillar-e2e` cold-start green; `wait-registration.mjs` proves self-assembly               |
| Merge P7-T07 / RD-9 (`KnownPillarId→string`)           | P7-T03 (RD-3) merged; full `pnpm -r test` + e2e-smoke green                                        |
| Promote any deploy staging→main                        | `wait-registration.mjs` confirms health + registration + `schema_version` for every changed pillar |
