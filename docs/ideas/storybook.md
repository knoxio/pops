# Idea: Storybook test + regression enforcement

Spun out of [PRD: Storybook](../themes/foundation/prds/storybook/README.md). The base Storybook (discovery, theme/app-colour decorators, a11y addon, alias-coverage CI guard) is built. The items below are gaps — present as intent or as an installed-but-unwired addon, not as enforced behaviour.

## Visual regression (Chromatic)

`@chromatic-com/storybook` is listed as a Storybook addon in `libs/ui/.storybook/main.ts`, but nothing publishes builds or runs snapshot diffs in CI. To finish:

- Wire a CI job to `build-storybook` and upload to Chromatic (or self-hosted alternative).
- Gate PRs on snapshot diffs for `@pops/ui` and pillar-frontend stories.
- Decide baseline-approval workflow (auto-accept on main vs. manual review).

## Stories-as-tests (Storybook test runner)

No `@storybook/addon-vitest` / test-runner integration exists — stories render in the dev surface and through the a11y addon interactively, but are not executed as automated tests. To finish:

- Add the Storybook Vitest plugin so every story is a smoke/interaction test (mount + play function + a11y assertions) in CI.
- Surface failures next to the existing `@pops/ui` Vitest run.

## Per-component story coverage

`check-storybook-coverage.mjs` only asserts every frontend `@pops/app-*` package has a Vite **alias** — it does **not** assert that each shared component has at least one story. "Every `@pops/ui` component has a story" is currently a convention tracked as tech debt. To enforce:

- Extend the coverage script to map exported components → story files and fail on uncovered components (with an allowlist for intentional exceptions).

## Hosting / deployment

A static `build-storybook` exists, but Storybook is not deployed or hosted anywhere. To finish:

- Publish the static build to a shareable URL (per-PR preview + a stable main build).
