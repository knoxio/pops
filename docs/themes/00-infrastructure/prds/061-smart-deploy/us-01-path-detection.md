# US-01: Path detection in deploy workflow

> PRD: [061 — Smart Deploy Pipeline](README.md)
> Status: Done

## Description

As a developer, I want the deploy workflow to detect which categories of files changed so that downstream jobs can decide what to build and restart.

## Acceptance Criteria

- [ ] New `detect-changes` job in `deploy.yml` runs before the deploy job
- [ ] Uses `git diff --name-only HEAD~1..HEAD` to list changed files in the merge commit
- [ ] Categorises changed paths into outputs: `frontend`, `backend`, `infra`, `skip_deploy`
- [ ] Path-to-category mapping:

| Pattern | Category |
|---------|----------|
| `apps/pops-shell/**`, `packages/app-*/**`, `packages/ui/**`, `packages/widgets/**`, `packages/navigation/**` | frontend |
| `apps/pops-api/**`, `packages/db-types/**`, `packages/types/**`, `packages/auth/**` | backend |
| `infra/**`, `docker-compose*`, `apps/pops-shell/nginx.conf` | infra |
| `docs/**`, `.github/**`, `*.md`, `packages/test-utils/**` | skip (only if no other category matched) |

- [ ] Multiple categories can be true simultaneously (e.g., frontend + backend)
- [ ] If `infra` is true, all other categories are ignored (full deploy)
- [ ] If only `skip` paths changed, `skip_deploy` is true
- [ ] Outputs are available to downstream jobs via `needs.detect-changes.outputs.*`
- [ ] Tests: verify category assignment for representative path combinations

## Notes

Use a simple shell script with grep/case patterns — no external action needed. The `dorny/paths-filter` action is designed for PR-level filtering, not merge commit analysis. A raw `git diff` is simpler and more reliable here.
