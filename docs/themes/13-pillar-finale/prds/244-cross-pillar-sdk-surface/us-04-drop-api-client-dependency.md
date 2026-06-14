# US-04: Drop `@pops/api-client` from `app-ai` + `app-finance` `package.json`

> PRD: [PRD-244 — Cross-pillar SDK surface](README.md)

## Description

As the maintainer of the PRD-218 retirement path for `@pops/api-client`, I
want the dependency removed from `packages/app-ai/package.json` and
`packages/app-finance/package.json` once US-01 and US-02 have eliminated every
source-level reference, so that the retirement count moves and a future
`@pops/api-client` change does not silently affect these packages.

## Acceptance Criteria

- [ ] `packages/app-ai/package.json` no longer lists `@pops/api-client` under
      `dependencies`, `devDependencies`, or `peerDependencies`.
- [ ] `packages/app-finance/package.json` no longer lists `@pops/api-client`
      under `dependencies`, `devDependencies`, or `peerDependencies`.
- [ ] `pnpm-lock.yaml` is regenerated and committed with the dependency drop.
- [ ] `grep -rn "@pops/api-client" packages/app-ai packages/app-finance`
      returns zero results.
- [ ] `pnpm --filter @pops/app-ai typecheck/test/build` and
      `pnpm --filter @pops/app-finance typecheck/test/build` pass clean
      against the post-drop tree.
- [ ] Full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Cannot land until US-01 **and** US-02 are merged. The dependency drop is
  a no-op safety check, not a migration step.
- Worktree quirk: `pnpm install --frozen-lockfile` for husky; expect to
  re-run `pnpm install` without the flag after editing the `package.json` to
  regenerate the lockfile, then commit the lockfile alongside the manifest
  change.
- If the post-drop typecheck surfaces a test file or fixture still importing
  `@pops/api-client`, that file was missed by US-01 / US-02 — go back and
  migrate or remove it. Do not add the dependency back.
- Verify the `@pops/api-client` retirement tracker (the PRD-218 / PRD-227
  list of consumers) reflects the drop. Two more boxes checked.
