# Epic 12: CI leanness

> Theme: [Pillar finale](../README.md)

## Scope

Collapse PR turnaround time by making every workflow fire only when its actual file dependencies change. The pillar split is not just a runtime decoupling — it's the opportunity to stop a finance contract bump from running media's Playwright suite. Five PRDs over five waves, each compounding on the last.

Done = a docs-only PR shows ≤ 4 required checks, a single-pillar API PR shows ≤ 6, a cross-pillar refactor shows only the affected pillars' workflows, and a budget-enforcement check fails any PR that drifts past its time budget.

## PRDs

| #   | PRD                                                                | Summary                                                                                                       | Status      |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 220 | [ci-path-filter-audit](../prds/220-ci-path-filter-audit/README.md) | Allowlist `paths:` on every workflow; carve out `quality.yml`                                                 | In progress |
| 221 | ci-affected-rebuild                                                | Single turbo `--filter='...[origin/main]'` job feeds matrix outputs to pillar/E2E/api workflows               | Not started |
| 222 | ci-docs-fast-path                                                  | Dedicated `docs-only` workflow for docs/markdown PRs; emits no-op success that satisfies branch protection    | Not started |
| 223 | ci-pillar-isolation                                                | `pillar-images.yml` matrix becomes `matrix: include: [{ pillar: changed }]` driven by affected-rebuild output | Not started |
| 224 | ci-e2e-scoping                                                     | Playwright suites tagged by pillar; E2E job runs only tagged subsets for affected pillars                     | Not started |
| 225 | ci-publish-narrowing                                               | `publish-images.yml` only republishes images whose contents actually changed since previous main commit       | Not started |
| 226 | ci-budget-enforcement                                              | CI check fails the PR if any required check exceeds its budget by >50%                                        | Not started |

PRDs ship serially across waves: 220 in wave 1, 221 + 222 in wave 2, 223 + 224 in wave 3, 225 in wave 4, 226 in wave 5. PRDs 221-226 all depend on 220's allowlist baseline.

## Dependencies

- **Requires:** Theme 12's pillar split (already shipped) — per-pillar workflows already exist; this epic refines their scope.
- **Unlocks:** Theme 13's parallel-agent topology. Without leanness, the required-check matrix on every PR becomes the bottleneck; with it, agents can ship narrow PRs in 1-3 minutes wall-clock.

## Out of Scope

- Replacing GitHub Actions with a different CI. Keep the platform; tighten the config.
- Self-hosted runners. The leanness work targets per-PR wall-clock; runner choice is orthogonal.
- Speeding up individual test suites. That's a per-test-author concern, not a CI-config concern.
