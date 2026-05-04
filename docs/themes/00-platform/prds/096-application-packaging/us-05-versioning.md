# US-05: Versioned image tags + release process for breaking-change announcements

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Not started

## Goal

Right now images are tagged `main` and `sha-<short>`. Any deployer pinned to `main` gets every change immediately. There's no way to say "stay on the previous stable release until I'm ready to upgrade", and no announcement channel for breaking changes to the compose contract (network names, secret names, env var renames).

Establish a release process: cut `vN` tags on the pops repo when the compose contract changes or when you want to mark a stable point. The publish workflow already handles `vN` tags — this US is about the _process_, not new code.

## Acceptance Criteria

- [ ] Release runbook at `docs/runbooks/cut-release.md` covers: when to cut a release, how to write the changelog, how to tag (`git tag v<N> && git push --tags`)
- [ ] CHANGELOG.md (or release notes via GitHub Releases) documents every `vN` with breaking-change call-outs
- [ ] README mentions the option to pin `POPS_IMAGE_TAG=v<N>` for deployers who want stability over freshness
- [ ] At least one `v<N>` cut after this US lands so the process has been exercised end-to-end

## Notes

- We don't need semver discipline — `v1`, `v2`, `v3` numbered releases are fine. The signal is "the contract changed, here's what to update".
- Breaking changes (per PRD-096) include: service names, network names, volume names, secret names, env var renames. Internal app changes don't trigger a release cut.
