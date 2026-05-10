# US-05: Versioned image tags + release process for breaking-change announcements

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Done

## Goal

Right now images are tagged `main` and `sha-<short>`. Any deployer pinned to `main` gets every change immediately. There's no way to say "stay on the previous stable release until I'm ready to upgrade", and no announcement channel for breaking changes to the compose contract (network names, secret names, env var renames).

Establish a release process: cut semver `vX.Y.Z` tags on the pops repo when the compose contract changes or when you want to mark a stable point. The publish workflow already handles `v*` tags — this US adds the _process_ around it (release-please for changelog/version bump automation, runbook, README pointer).

## Acceptance Criteria

- [x] Release runbook at `docs/runbooks/cut-release.md` covers: when to cut a release, how to write the changelog, how to tag (`git tag vX.Y.Z && git push --tags`)
- [x] CHANGELOG.md (or release notes via GitHub Releases) documents every `vX.Y.Z` with breaking-change call-outs — automated by release-please based on Conventional Commits
- [x] README mentions the option to pin `POPS_IMAGE_TAG=vX.Y.Z` (or `vX.Y`, `vX`) for deployers who want stability over freshness
- [ ] At least one `vX.Y.Z` cut after this US lands so the process has been exercised end-to-end

## Implementation

- Versioning scheme: **semver on git tag** (`v0.1.0`, `v0.2.0`, `v1.0.0`). Single product version covers both `pops-api` and `pops-shell` since they ship together.
- Tagging in CI: `.github/workflows/publish-images.yml` already triggers on `tags: ['v*']`. The `docker/metadata-action` config now emits the version-tagged variants alongside `main` / `sha-<short>`.
- Changelog & version bumps: `googleapis/release-please-action@v4` runs on every push to `main`, opens a release PR with a `version.txt` bump + regenerated `CHANGELOG.md`, and tags `vX.Y.Z` when the PR is merged.
- Release-please config: single-package monorepo entry (`release-type: simple`), one CHANGELOG, one version — matches how the images ship.
- Runbook: `docs/runbooks/cut-release.md` documents when to cut, the Conventional Commits cheat sheet, the manual escape hatch, and how a deployer pins a version.

## Notes

- Pre-1.0 we follow release-please's default: `feat:` bumps minor, `fix:` bumps patch, `feat!:` / `BREAKING CHANGE:` footnote bumps major. Once we tag `v1.0.0`, MAJOR is reserved for compose-contract breakage only.
- Breaking changes (per PRD-096) include: service names, network names, volume names, secret names, env var renames. Internal app changes don't trigger a release cut — `main` and `sha-*` tags are sufficient for fresh deployers.
