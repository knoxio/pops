# Runbook: Cut a Pops Release

> Audience: anyone with `write` access to `knoxio/pops`.
> Frequency: when the compose contract changes (network names, secret names, env var renames, image names) or when a stable point is worth marking.
> Related: [PRD-096 — Application Packaging & GHCR Contract](../themes/00-platform/prds/096-application-packaging/README.md).

## TL;DR

1. Land changes on `main` using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:` for breaking).
2. Wait for the `Release Please` workflow to open (or update) a release PR with the version bump + CHANGELOG.
3. Review the release PR. Merge it.
4. release-please pushes the `vX.Y.Z` git tag, which triggers `Publish Images` to publish `ghcr.io/knoxio/pops-{api,shell}:vX.Y.Z` (plus `X.Y`, `X`, and unprefixed forms).
5. Update any deployer that pins `POPS_IMAGE_TAG` (knoxio lab tracks `main` via Watchtower, so no action needed there).

## When to cut

Cut a release when **any** of these change in a way deployers can observe:

- service names (`pops-api`, `pops-shell`, `pops-worker`)
- network names (`pops-frontend`, `pops-backend`, `pops-documents`)
- volume names (`pops-sqlite-data`, `pops-redis-data`, `pops-paperless-*`, `pops-metabase-data`)
- secret names (any of the 10 files in `secrets/`)
- env vars consumed by compose (`POPS_IMAGE_TAG`, `POPS_DOMAIN`, `PAPERLESS_BASE_URL`, …)
- the image names or registries themselves

Internal app refactors that don't change the compose contract don't need a release cut — the `main` and `sha-*` tags are sufficient for fresh deployers.

## Versioning scheme

Semver on git tag: `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`, `v1.2.3`).

| Bump  | Trigger                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| MAJOR | Breaking compose-contract change (renamed service, removed network, mandatory new env var)          |
| MINOR | Backwards-compatible additions (new optional env var, new container, new secret with empty default) |
| PATCH | Bug fixes, doc-only changes, internal app changes published in lockstep                             |

We're pre-1.0, so MINOR currently doubles as "potentially breaking" per release-please defaults. Once we hit `v1.0.0`, MAJOR is reserved for breakage.

## Conventional Commits cheat sheet

release-please reads commit messages on `main` to draft the next version + CHANGELOG.

| Commit prefix                               | Bump  | Goes in CHANGELOG section |
| ------------------------------------------- | ----- | ------------------------- |
| `feat: …`                                   | minor | Features                  |
| `fix: …`                                    | patch | Bug Fixes                 |
| `perf: …`                                   | patch | Performance               |
| `feat!: …`                                  | major | Features (! marks break)  |
| `BREAKING CHANGE:`                          | major | Footnoted in release      |
| `docs: …`                                   | patch | Documentation             |
| `ci: …` / `build: …`                        | patch | CI/CD / Build             |
| `chore:` / `refactor:` / `test:` / `style:` | none  | Hidden by default         |

Scopes (`feat(api): …`) are preserved verbatim in the changelog.

## How a release happens

```text
commits land on main (Conventional Commits)
        │
        ▼
release-please workflow runs on each push to main
        │
        ▼
opens / updates a "release PR" with:
  - version.txt bump
  - CHANGELOG.md regenerated
        │
        ▼
human reviews + merges the release PR
        │
        ▼
release-please pushes a vX.Y.Z git tag + GitHub Release
        │
        ▼
publish-images.yml triggers on tag push, builds + tags:
  ghcr.io/knoxio/pops-api:vX.Y.Z, X.Y.Z, vX.Y, X.Y, vX, X
  ghcr.io/knoxio/pops-shell:vX.Y.Z, X.Y.Z, vX.Y, X.Y, vX, X
```

## Manual escape hatch

If release-please is unavailable or the PR is wrong, cut the tag by hand from `main`:

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

Then write release notes in the GitHub Release UI. The image publish workflow runs on any `v*` tag push regardless of who created it.

## Pinning a release as a deployer

```bash
echo 'POPS_IMAGE_TAG=v0.1.0' >> .env
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

Watchtower will not roll forward as long as the resolved digest doesn't move. To resume tracking `main`:

```bash
sed -i '' 's/^POPS_IMAGE_TAG=.*/POPS_IMAGE_TAG=main/' .env
docker compose -f infra/docker-compose.yml up -d
```

## First-time setup checklist (one-off)

- [x] `release-please-config.json` and `.release-please-manifest.json` at the repo root
- [x] `version.txt` at the repo root (release-type `simple`)
- [x] `.github/workflows/release-please.yml`
- [x] `.github/workflows/publish-images.yml` includes `type=semver` patterns for the `v*` tag trigger
- [ ] First `vX.Y.Z` tag cut to exercise the pipeline end-to-end
