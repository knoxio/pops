# .github/workflows

Every workflow YAML file in this directory is documented here exactly once: as a row in [The rest](#the-rest) below, or — where a row is not enough — under its own `##` section. The sectioned ones are `ci-gate.yml` and the two reusable `workflow_call`-only helpers no event triggers on its own, `_discover-units.yml` and `_extractability-sandbox-matrix.yml`. `scripts/ci/__tests__/workflow-readme-coverage.test.ts` asserts that split against disk, so a new workflow cannot land undocumented and a deleted one cannot leave a row behind. Every job runs on `ubuntu-latest` except `ios-quality.yml`, which needs macOS to compile Swift at all.

## `ci-gate.yml` — the one static aggregate context

`ci-gate.yml` runs a job named `Publish CI Gate verdict`, triggered
`on: workflow_run` `types: [completed]` of nine workflows: Unit Quality, FE
Quality, Rust Quality, App Quality, Quality, Registry Generated Quality, iOS
Quality, Docker Build, E2E Tests. Each name appears twice in that file — in the trigger
array and in the `gated` array inside the script — and either alone is inert. It
reads their conclusions through the Actions API and runs none of them itself. The
file header carries the argument for `workflow_run` over `needs:`, for why the
verdict converges, and for why it publishes its own check run; the rules the
`github-script` step implements:

- Concurrency is keyed `ci-gate-${{ github.event.workflow_run.head_sha }}` with
  `cancel-in-progress: true`, so every sibling completion for a commit collapses
  onto one evaluation lane.
- All runs at that head SHA are paginated; the newest run per gated workflow name
  wins, ordered by `run_number` then `run_attempt`.
- The gate fails on `failure`, `cancelled`, `timed_out`, `startup_failure`,
  `action_required` or `stale`.
- A gated workflow with no run at the SHA is `pass` only when its own
  `pull_request.paths` filter is a **confirmed** exclusion for this diff
  (`did not run — path-filtered, treated as pass`); everything else — the
  filter matches, there is no filter, or the diff can't be determined — is
  logged as pending, never a pass. One cause of "no run, not a confirmed
  exclusion" used to be a concurrency-group race silently losing the run's
  registration entirely; every gated workflow's own `concurrency:` block now
  runs `cancel-in-progress: false` specifically to close that window — see the
  MITIGATION paragraph in `ci-gate.yml`'s own CONVERGENCE comment.
- A run that is not yet `completed` is pending: it does not fail the gate, but it
  does hold it at `in_progress`. A failure concludes immediately (nothing can
  clear it); `success` is only ever published once nothing is left in flight.
- The verdict is POSTed as a **check run named `CI Gate` against
  `github.event.workflow_run.head_sha`** (hence `permissions: checks: write`).
  That is the context to put in the branch ruleset.
- The run's own `run-name` states the evaluated SHA, branch and triggering
  workflow, because `gh run list` / the Actions UI file every `workflow_run`
  run under the default branch's tip regardless — see the next section for why
  that makes the run list, as opposed to the check run above, an unreliable
  place to read a commit's gate state.

### Rules this file exists to stop people relearning

**A `workflow_run` job's implicit check run lands on the default branch's tip,
not on the head it judged.** Until the gate began POSTing its own check run it
had never once appeared on a pull request, however green or red it was. If the
`checks.create` call is ever dropped, the gate silently reverts to being a
post-hoc signal on `main`.

**The run itself is filed under the same misattribution, and POSTing the check
run does not fix it.** `gh run list --branch main` (and the Actions UI) always
attribute a `workflow_run` run to the default branch's tip, never to
`github.event.workflow_run.head_sha` — so a `CI Gate` run that fails while
evaluating an unrelated PR branch still reads as a red `CI Gate` on `main`'s
run list. Example: a run filed at `ea478a403` (main's tip) whose log read
`Triggered by "iOS Quality" (conclusion=failure) at 04773d252` — a commit on an
unrelated PR branch; every gated workflow at `ea478a403` itself had passed. The
gate evaluated and published correctly; only the run's own place in the list
was wrong. `run-name` (above) puts the evaluated SHA and branch in the run's
title so this is visible without opening the log, but the run's status column
still means "the commit named in this run's title", never "the branch column
next to it" — **`gh run list` is never the authoritative source for a commit's
gate state.** That is always the check run itself:

```
gh api repos/knoxio-labs/pops/commits/<sha>/check-runs \
  --jq '.check_runs[] | select(.name=="CI Gate")'
```

**"Not in the ruleset" does not mean "cannot block".** The gate aggregates the
**workflow-level** conclusion of each gated workflow, so one red job anywhere in
`quality.yml`, `unit-quality.yml`, … turns the single `CI Gate` context red
regardless of that job's own name. The only way to make a job advisory is
`continue-on-error: true`, which erases it from its workflow's conclusion; a
comment claiming a job is non-blocking because the ruleset does not list it by
name is wrong. Nothing in `quality.yml` is advisory today.

**Green must mean "everything finished and passed", not "nothing has failed
yet".** The gate fires on each sibling's completion, so the earliest evaluation
sees seven workflows still running. Concluding `success` there would put the
context green — and, once it is required, the PR mergeable — minutes before the
slowest gated workflow has an opinion, and the failure would land after the
merge. Hence `in_progress` until nothing is pending.

**A guard must be exercised against the condition it exists to detect, not
against a healthy tree.** Everything above shares one shape — a check that
looked fine precisely because it was never put in the state it was built for.
The implicit check run was green on `main` while judging nothing. A premature
`success` was green while seven workflows were still running. The wiring guard
threw a `TypeError` instead of reporting when `Quality` was renamed. And it
matched keys with regexes anchored at end-of-line, so every one of them was
blind to an inline value or a trailing comment — including the
`paths: ["**"] # …` form this repo already uses in `unit-quality.yml`, meaning a
path filter added to `Quality` that way would have slipped straight past. Green
from a check that was never made to fail is not evidence.

Concretely: **do not match workflow YAML by text.** `key:`, `key: value`,
`key: value # note` and `on: { key: value }` are all the same declaration, and a
matcher written against one of them silently matches nothing and reports
success — that is how three separate fixes to the wiring guard each closed one
spelling and left the next. The guard now parses with `js-yaml` and walks the
document, so the spellings collapse before it looks at them. What it still
matches textually is the `gated` array and the two `checks.create` invariants,
because those live in the embedded `github-script` body — JavaScript inside a
YAML scalar, which the parser hands over exactly.

`scripts/ci/check-ci-gate-wiring.mjs` asserts the rules above, plus the
trigger/`gated` agreement and that every gated name still resolves to a real
workflow. It runs in `quality.yml`'s `Scripts tests` job, which installs the
workspace — see the tier amendment in
[ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md) for
which guard jobs may import a parser and which may not.

### Current state of the ruleset

The `main` branch ruleset requires `agent-review`, `Lint`, `Format`,
`Module boundaries`, `Duplication check` **and `CI Gate`** — so every typecheck,
test, build, clippy, exports, extractability, bundle-map, drift and Docker
image-smoke job now blocks a merge through that one aggregated context, even
though none of them is listed by name. That only stays safe while `Quality`
stays gated and unfiltered: it is what guarantees the context reports on every
PR, docs-only ones included, and a required context that never reports blocks
its PR forever.

### The merge queue, and the `merge_group` trigger it depends on

`main` is behind a **merge queue** — the `merge_queue` rule on the `main` branch
ruleset, which is where to check it rather than take this paragraph's word for
it. A pull request is never merged on the strength of its own run: the queue
rebuilds it on top of `main`'s current tip as a temporary
`gh-readonly-queue/main/...` ref, re-runs the required checks against that, and
merges only if they pass there. Two PRs that are each green against a base that
does not contain the other — different files, no textual conflict, an
incompatibility only a compiler can see — are what this exists to stop.

The triggers below went in one commit ahead of that rule, and the order is not
cosmetic: a queue whose required checks do not declare `merge_group` holds its
first entry until the check-response timeout evicts it, and every entry behind
it. Trigger first, rule second.

**Every workflow behind a required context therefore triggers on `merge_group`.**
`quality.yml` and `agent-review.yml` for the five directly-required contexts,
and all nine of the workflows `ci-gate.yml` aggregates, or `CI Gate` would go
green on the merge group having observed nothing. Deleting a `merge_group:`
trigger from any of them does not turn a check off, it makes that check never
report on the queue's ref — and an entry whose required check never reports sits
until the queue's check-response timeout evicts it. A queue that evicts
everything is indistinguishable, from the outside, from a repo where nothing can
merge.

**A merge-group TRIGGER cannot be path-filtered, so the scoping moved into a
job.** `paths:` is accepted only on `push`, `pull_request` and
`pull_request_target`; under `merge_group` it is a workflow syntax error, and
`dorny/paths-filter` has no diff base on the event either. Every workflow's
`merge_group` trigger is therefore unconditional and always registers a run.
What the two expensive ones do inside that run is scoped:
`ios-quality.yml` and `docker-build.yml` each open with a cheap `ubuntu-latest`
`scope` job that runs `scripts/ci/merge-group-scope.mjs`, which reads **that
workflow's own `on.pull_request.paths`** off disk and answers it against
`git diff <merge_group.base_sha>..<merge_group.head_sha>`. The expensive jobs
are conditioned on its `selected` output. Every other gated workflow's queue
lane still runs what a push to `main` runs.

One implementation, not one glob list per workflow: widening a workflow's
`pull_request.paths` widens its queue lane in the same edit, and the two cannot
drift. The helper is the only thing in the fleet whose wrong answer is
invisible — a skip that should have been a build leaves the workflow concluding
`success` and `CI Gate` aggregating it — so it has no tolerant branch at all.
An unresolvable base, a base that is not an ancestor of the head, an **empty
diff** (the signature of a wrong base, and the input that would deselect every
lane at once), a missing or unparseable workflow, a `pull_request` trigger with
no `paths:` — each exits non-zero, which skips the expensive job *and* fails the
workflow. A red queue entry costs one re-queue; a wrong skip merges a commit
nothing compiled. Its `--self-test` proves both directions (it selects a
touching diff, it deselects a non-touching one) and every refusal above, and it
runs in the `scope` job itself immediately before the answer it qualifies, not
only in `agent-review.yml`'s preflight.

The corollary is that a workflow's declared `pull_request.paths` is now
load-bearing in two lanes. `ios-quality.yml`'s path filter covers
`clients/ios/**`, `pillars/bfm/**`, `scripts/ios-e2e/**` — the pillar and the
harness because its UI-flow step boots a real BFM — and `pnpm-lock.yaml`,
since a lockfile bump changes what that boot resolves. It deliberately does
not cover the BFM's transitive `libs/*` (today just `libs/sdk` and
`libs/types`, per `pnpm list --filter "@pops/bfm..." --depth Infinity`): that
pair is touched far more often than the lockfile, both libs are already gated
by `unit-quality.yml` (which runs the BFM's own typecheck and vitest suite
against them), and this job's header explains the trade in full.

**What it costs and what it saves**, measured on the 39 completed merge-queue
entries immediately before the scoping change. Each entry's `ios-quality.yml`
run took a median of 20 minutes end to end (mean 20.1 minutes, 90th percentile
28 minutes), and **33 of the 39 touched no iOS path at all** — so five compiles
in six were spent on a merge group the job had nothing to say about. The `scope`
job that now decides between them takes 32 seconds, of which its self-test and
its answer are one second and the rest is checkout plus a warm-cache `pnpm
install`.

**The queue groups entries, and that is the other half of the cost.** With
`min_entries_to_merge: 1` the queue formed a group per entry, so each PR bought
its own run of everything. Measured on the 15 merges after the `scope` job
landed, the queue leg — first merge-group run created to merged — split cleanly
in two: a median of **2.9 minutes** for the entries `scope` deselected iOS on,
against **85.8 minutes** for the entries it selected. The spread is not the
queue. That was dominated by the full iOS suite. The selected merge-group lane
now runs only formatting plus the simulator `build-for-testing` and compiler-log
analysis; the simulator tests and Release build run on the PR, while the Maestro
flow runs only after merge. This keeps merge-order compilation coverage while
avoiding a second run of tests whose PR result already established their
behaviour.

`check_response_timeout_minutes` is 75, raised from 60. A check that does not
report inside that window evicts its entry, and the worst in-queue
`ios-quality.yml` run observed was 52 minutes end to end — which at 60 left
eight minutes of margin, less than a cold macOS runner acquisition can spend
before the job even starts. At 75 that margin is 23.

Two consequences worth stating, because both look like bugs from the outside:

- **A step condition spelled `github.event_name == 'push'` is a trap here.** The
  `changes` jobs in `fe-quality.yml` and `docker-build.yml` are pull-request-only,
  so on a merge group their outputs are empty; a step gated on `push` alone is
  skipped, the job still concludes `success`, and the workflow reports green
  having run nothing. Those conditions read `!= 'pull_request'` for that reason.
- **`github.base_ref` is empty on a merge group.** Anything that needs the base
  reads `github.event.merge_group.base_ref` instead, which is a full
  `refs/heads/…` ref rather than a bare branch name (`agent-review.yml`'s
  isolation litmus). Anything that needs a PR number — the advisory LLM review —
  is explicitly `github.event_name == 'pull_request'`, since
  `github.event.pull_request.draft == false` is *true* when the payload has no
  pull request at all: GitHub coerces both sides of `null == false` to `0`.

## `_discover-units.yml`

Reusable (`on: workflow_call`), called by `unit-quality.yml`, `quality.yml`,
and both `extractability-sandbox.yml` and `extractability-sandbox-push.yml`.
Its `list` job scans `pillars/` and `libs/` at maxdepth 1 and emits
`{name, pkg, dir, kind, lang}` per unit, reading `pkg` from `package.json#name`
or a `Cargo.toml` `[package].name`; manifest-less dirs are skipped and a unit
with no resolvable package name fails the job. Outputs are `units` (all) and
`changed` (units whose dir appears in the diff against the merge-base — or every
unit when `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
`tsconfig.build.json`, `.oxfmtrc.json`, `.oxlintrc.json`, `mise.toml`,
`mise.ci.toml`, `Cargo.toml` or `Cargo.lock` changed). The header explains why
the scan stops at maxdepth 1.

The diff's base differs by event: `pull_request` (and `merge_group`) diff from
`merge-base(origin/<base_ref>, HEAD)`, the PR's fork point. `push` diffs from
`github.event.before` instead — `origin/<branch>` is refreshed by the same
checkout that fetches the run's own commit, so on a push it already includes
(usually equals) HEAD, and `merge-base(HEAD, HEAD)` is `HEAD`: diffing HEAD
against itself is empty no matter what the push changed. This was verified
against a real commit pair from this repo's history before
`extractability-sandbox-push.yml` was allowed to depend on it — see the `scan`
step's own comments.

A third output, `changedClientDirs`, applies the same rule to `clients/*`
instead: outside the pnpm/cargo workspace (ADR-043), so it carries no
`package.json`/`Cargo.toml` and is never a `units`/`changed` member, but a
PR touching `clients/**` (or the same shared root above) still needs its
markdown/JSON/CSS checked by `quality.yml`'s `Format` job — the only
PR-scoped gate that applies to a client's non-Swift files, since Swift
formatting and linting is `ios-quality.yml`'s own job.

A second job, `assert-app-coverage`, enumerates the 7 `pillars/*/app` dirs,
requires each `package.json#name` to match `@pops/app-*`, and greps both
`fe-quality.yml` and `app-quality.yml` for a `pillars/*/app/**` trigger — reading
files only, no install.

## `_extractability-sandbox-matrix.yml`

Reusable (`on: workflow_call`, one input: `units`, a JSON array of
`{name,pkg,dir,kind,lang}` objects). Sandboxes every TS unit in `units` with
`scripts/extractability/sandbox.sh` and every Rust one with
`scripts/extractability/cargo-sandbox.sh`, exactly as `extractability-sandbox.yml`
did inline before this file existed. Extracted so the nightly/on-demand sweep and the
push-triggered fan-out (below) share one sandboxing implementation instead of
two copies that could drift apart — which units to sandbox is entirely the
caller's decision; this file only knows how to sandbox whatever `units` names.

## The rest

| File                             | Trigger                                                       | Runs                                                                                                             |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `quality.yml`                    | every PR + push to `main` + every merge group — **no path filter, deliberately** | The repo-wide gate: `Lint`, `Format`, `Module boundaries`, `Duplication check` and the cross-cutting drift checks; scoped to changed units on PRs, whole tree on `main`. No job is advisory, and no job count is recorded here — it rotted twice; the file's own header is the list. See the `CI Gate` rules above |
| `unit-quality.yml`               | PR/push on unit + shared-root paths; every merge group        | ts and rust lanes over the changed-unit matrix                                                                      |
| `app-quality.yml`                | PR/push on `pillars/*/app/**`, `pillars/*/openapi/**`, FE libs; every merge group | each `@pops/app-*`'s own typecheck + test                                                                           |
| `fe-quality.yml`                 | PR/push on `pillars/shell/**`, apps, openapi, FE libs; every merge group | the shell's `Quality Checks` job                                                                                     |
| `rust-quality.yml`               | PR/push on Cargo files, `deny.toml`, `pillars/contacts/**`, `libs/pops-*`, `scripts/extractability/**`; every merge group | `fmt + clippy + build + test`                                       |
| `registry-generated-quality.yml` | PR/push on `libs/module-registry/**`, `libs/types/**`; every merge group | `generated.ts` drift                                                                                                |
| `ios-quality.yml`                | PR/push on `clients/ios/**`, `pillars/bfm/**`, `scripts/ios-e2e/**`, `pnpm-lock.yaml`; every merge group, **scoped by a `scope` job to that same filter** | `macos-latest`; selects the Xcode pinned in `clients/ios/mise.toml`, then runs formatting and compiler-log analysis. PRs additionally run the simulator tests and a Release build that verifies no BFM host is embedded; post-merge pushes also run the Maestro UI flow against a real BFM. Caches no derived data, deliberately; the header says why |
| `agent-review.yml`               | every PR, drafts included; every merge group                  | nine guard scripts under `scripts/ci/`, each `--self-test`ed first, plus `merge-group-scope.mjs`'s preflight. Deterministic only — the advisory reviewer that used to be its last step is now `pr-review.yml` |
| `pr-review.yml`                  | every non-draft, non-Dependabot PR; **no** merge group, **not** required, **not** in `ci-gate.yml`'s gated list | the compounding LLM review: one sticky comment per PR, only the commits pushed since the last run, findings carried forward and resolved from the tree. Debounced and `cancel-in-progress: true`, which is only possible because nothing gates on it. Skips, by design, a PR whose every changed path is on the design playground's design surface — `scripts/ci/design-surface-only.mjs` decides, fail-closed, and `review-findings-gate.yml` asks it the same question. Job-level skipped for a Dependabot-authored PR (POPS-3343): that run cannot read `CLAUDE_CODE_OAUTH_TOKEN` regardless, and a skip is safe here specifically because this job is neither required nor gated |
| `pr-review-dependabot.yml`       | every non-draft, Dependabot-authored PR; **no** merge group, **not** required, **not** in `ci-gate.yml`'s gated list | the substitute for the row above, only for the PRs it cannot run on (POPS-3343): posts the identical sticky-comment contract with zero findings, via the same `pr-review.mjs publish` code path, but never calls a model or reads the diff — a prose line above the state marker says so |
| `review-findings-gate.yml`       | every PR, drafts included; every merge group; **required**                                    | blocks a merge while `pr-review.yml`'s (or, on a Dependabot PR, `pr-review-dependabot.yml`'s) sticky comment carries an open finding for the head commit (POPS-2661); polls for the debounced review, passes through on a merge group, and passes without polling on a design-surface-only diff because no review will ever come |
| `docker-build.yml`               | PR/push on Dockerfiles, `infra/docker*`, lockfile; every merge group, **scoped by a `scope` job to that same filter** | the FULL image of every `pillars/*/Dockerfile`, each then started on fresh volumes and probed by `scripts/ci/smoke-image.mjs`; `docker compose config --quiet` on both compose files after stubbing 12 secret files |
| `pillar-quality.yml`             | push to `main` only                                           | full image (`push: false`) per `pillars/<x>` that has a `package.json`                                               |
| `pillar-schema-coverage.yml`     | PR/push on `pillars/*/src/db/**`, migrations                  | per-pillar coverage, an injected-table self-test, and a static `Pillar schema coverage` aggregator job               |
| `publish-images.yml`             | push to `main`, `v*` tags, dispatch (`only` input)            | four static app images plus every `pops-<x>` discovered from the prod compose's `image:` refs                        |
| `release.yml`                    | push to `main`, dispatch                                      | `.github/scripts/release.sh` decides whether to cut at all, then the moltbot bundle, an annotated tag, `gh release create`, and a `workflow_dispatch` of `publish-images.yml` at that tag — the tag push itself cannot trigger it, being a `GITHUB_TOKEN` event |
| `infra-lint.yml`                 | PR/push on `infra/litestream/**`, `infra/backup/**`           | YAML lint                                                                                                           |
| `extractability-sandbox.yml`     | nightly cron + `workflow_dispatch` (optional single-`unit` input) — **not** PR/push, **not** in `ci-gate.yml`'s gated list | EX-2 via `_extractability-sandbox-matrix.yml` over every unit `_discover-units.yml` discovers (or just the dispatched one) — the true zero-workspace extraction proof, too heavy for a per-push gate |
| `extractability-sandbox-push.yml` | push to `main` on a unit's `package.json`/`tsconfig*.json`/`Cargo.toml`/`Cargo.lock`/`pnpm-lock.yaml` — **not** PR, **not** in `ci-gate.yml`'s gated list | EX-2 via `_extractability-sandbox-matrix.yml`, scoped to ONLY `_discover-units.yml`'s `changed` set for that push — fast feedback on an exports/dep-shape change instead of waiting for the nightly sweep |
| `workflows-quality.yml`          | PR/push on `.github/workflows/**`                             | YAML lint                                                                                                           |
| `fe-test-e2e.yml`                | PR on the shell/app/nav/registry/sdk/types/ui paths, push to `main`, merge group, dispatch | Playwright over the shell and the app bundles it mounts; no pillar backend runs — each spec fulfils its own `/<pillar>-api` surface |
| `live-seam.yml`                  | PR/push on `libs/sdk/**`, `pillars/registry/**`, the food/cerebrum/bfm live-seam module pairs + their `vitest.live-seam.config.ts`, `pillars/lists/**`, `pillars/finance/**`, `pillars/bfm/**`, `pillars/purchases/**`, and its own workflow file; no merge group | food's, cerebrum's and bfm's real-process `test:live-seam` suites, each in its own job. **Advisory, not gated** — neither job is in `ci-gate.yml`'s `gated` array or the ruleset, deliberately, for a bake-in period; see the file header |

`publish-images.yml`'s `discover` job filters on `pillars/<x>/Dockerfile`
existing. `shell`, `mcp`, `orchestrator` and `docs` all have one, so the four
images in the static `apps` matrix are also built by the `pillars` job.
