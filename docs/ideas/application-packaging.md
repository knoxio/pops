# Idea: Application packaging follow-ups

Deferred / partial work split out of the Application Packaging & GHCR Contract PRD. The PRD documents what is built and live; this file holds the gaps.

## Restore the `release.yml` push trigger

`.github/workflows/release.yml` currently runs `on: workflow_dispatch` only. The push-to-`main` trigger was disabled during the pillar-colocation work so a half-renamed path couldn't reach the live host via the tag → publish chain. The colocation/federation series is now complete (the publish workflow's auto-publish on push was restored), so this gate is stale.

- Restore `on: push: branches: [main]` in `release.yml`.
- Verify the bump computation in `.github/scripts/release.sh` still behaves with the current tag history (444 `vX.Y.Z` tags exist; `LAST_TAG` resolution must pick the highest strict semver tag).
- Confirm the tag → `publish-images.yml` chain republishes the full fleet at the new tag.

Until restored, releases are cut manually via the workflow dispatch UI or the manual escape hatch in the release runbook.

## Publish a moltbot config package

The `moltbot` compose profile bind-mounts `pillars/moltbot/config` and `pillars/moltbot/skills` from the source tree. A deployer using moltbot therefore needs the source tree present, which breaks the "no source clone needed" contract for that one profile.

- Package the moltbot config + skills as their own artifact (a published image, an OCI artifact, or a versioned tarball) so a deployer can consume them the same way they consume the pillar images.
- Until then, document that moltbot is the one profile that requires the source tree.

## Rewrite moltbot skill prompts for the pillar REST surfaces

The bundled moltbot skill templates still describe the decommissioned monolith's REST/tRPC routes. The compose file repoints the hosts (e.g. `POPS_API_URL` → `cerebrum-api:3007`, `FINANCE_API_URL` → `finance-api:3004`), but repointing the host is necessary, not sufficient:

- The finance skill must drop `/budgets/summary`, move entity lookups to the registry pillar, and adopt the finance pillar's REST paths.
- The cerebrum skill must switch to the cerebrum pillar's REST paths.
- The food worker image (source out-of-repo) still posts results over a tRPC client; it must speak the food pillar's REST `POST /ingest/worker-complete`.

These are correctness gaps, not packaging gaps — moltbot will mis-call the backend until the templates are rewritten.
