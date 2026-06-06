# US-05: Versioned image tags + release process for breaking-change announcements

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Done

## Goal

Right now images are tagged `main` and `sha-<short>`. Any deployer pinned to `main` gets every change immediately. There's no way to say "stay on the previous stable release until I'm ready to upgrade", and no announcement channel for breaking changes to the compose contract (network names, secret names, env var renames).

Establish a release process: cut semver `vX.Y.Z` tags on the pops repo when the compose contract changes or when you want to mark a stable point. The publish workflow already handles `v*` tags — this US adds the _process_ around it (push-driven release script, runbook, README pointer).

## Acceptance Criteria

- [x] Release runbook at `docs/runbooks/cut-release.md` covers: when to cut a release, how to write the changelog, how to tag (`git tag vX.Y.Z && git push --tags`)
- [x] CHANGELOG.md (or release notes via GitHub Releases) documents every `vX.Y.Z` with breaking-change call-outs — automated by `release.yml` based on Conventional Commits
- [x] README mentions the option to pin `POPS_IMAGE_TAG=vX.Y.Z` (or `vX.Y`, `vX`) for deployers who want stability over freshness
- [ ] At least one `vX.Y.Z` cut after this US lands so the process has been exercised end-to-end

## Implementation

- Versioning scheme: **semver on git tag** (`v0.1.0`, `v0.2.0`, `v1.0.0`). Single product version covers both `pops-api` and `pops-shell` since they ship together.
- Tagging in CI: `.github/workflows/publish-images.yml` already triggers on `tags: ['v*']`. The `docker/metadata-action` config now emits the version-tagged variants alongside `main` / `sha-<short>`.
- Changelog & version bumps: `.github/workflows/release.yml` runs `.github/scripts/release.sh` on every push to `main`. The script reads commits since the last `v*` tag, computes the bump, prepends a section to `CHANGELOG.md`, updates `version.txt`, commits, tags `vX.Y.Z`, pushes, and creates the GitHub Release — no PR ceremony.
- Recursion guard: the job skips itself when the head commit starts with `chore(release):`, and `GITHUB_TOKEN`-driven pushes don't re-trigger `push:` workflows.
- Runbook: `docs/runbooks/cut-release.md` documents when to cut, the Conventional Commits cheat sheet, the manual escape hatch, and how a deployer pins a version.

## Notes

- Pre-1.0 the release script collapses major bumps into minor: `feat:` → minor, `fix:` / `perf:` → patch, `feat!:` / `BREAKING CHANGE:` → minor (won't promote to `v1.0.0` automatically). Once we tag `v1.0.0`, MAJOR is reserved for compose-contract breakage only.
- Breaking changes (per PRD-096) include: service names, network names, volume names, secret names, env var renames. Internal app changes don't trigger a release cut — `main` and `sha-*` tags are sufficient for fresh deployers.
