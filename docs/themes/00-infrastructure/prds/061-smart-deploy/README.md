# PRD-061: Smart Deploy Pipeline

> Epic: [04 — CI/CD Pipelines](../../epics/04-cicd-pipelines.md)
> Status: Done

## Overview

Build a deploy pipeline that detects which services changed and only rebuilds/restarts what's necessary. Skip deployment entirely for docs-only or CI-only changes. Reduce deploy time from ~5 minutes (full rebuild) to seconds (selective restart) for typical frontend or backend changes.

## Current State

Every merge to main triggers a full Ansible deploy that:

1. Git pulls the entire repo on the server
2. Templates the docker-compose.yml
3. Builds ALL custom Docker images (pops-api, pops-shell)
4. Pulls ALL third-party images (metabase, paperless, moltbot, cloudflared)
5. Restarts ALL services via `docker compose up -d`

This takes ~5 minutes regardless of what changed.

## Target State

| Change type                                                 | What happens                                           | Expected time |
| ----------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| Frontend only (pops-shell, app-\*, ui, navigation, widgets) | Rebuild pops-shell image, restart pops-shell container | ~1 min        |
| Backend only (pops-api, db-types)                           | Rebuild pops-api image, restart pops-api container     | ~1 min        |
| Both frontend + backend                                     | Rebuild both images, restart both containers           | ~2 min        |
| Infrastructure (docker-compose, ansible, nginx)             | Full deploy (current behaviour)                        | ~5 min        |
| Docs, CI workflows, or test-only changes                    | No deploy                                              | 0             |

## Architecture

### Path Detection

The deploy workflow detects which paths changed between the merge commit and its parent:

| Path pattern                                                                                                 | Category           |
| ------------------------------------------------------------------------------------------------------------ | ------------------ |
| `apps/pops-shell/**`, `packages/app-*/**`, `packages/ui/**`, `packages/widgets/**`, `packages/navigation/**` | `frontend`         |
| `apps/pops-api/**`, `packages/db-types/**`, `packages/types/**`, `packages/auth/**`                          | `backend`          |
| `infra/**`, `apps/pops-shell/nginx.conf`, `docker-compose*`                                                  | `infra`            |
| `docs/**`, `.github/**`, `*.md`                                                                              | `skip` (no deploy) |

Multiple categories can be active (e.g., a PR touching both `apps/pops-api/` and `packages/ui/` triggers both backend and frontend).

### Selective Build + Restart

Instead of always running the full Ansible deploy playbook, the workflow directly executes Docker commands on the self-hosted runner:

```
# Only if frontend changed:
docker compose build pops-shell
docker compose up -d pops-shell

# Only if backend changed:
docker compose build pops-api
docker compose up -d pops-api

# Only if infra changed:
# Full Ansible deploy (current behaviour)
```

### Skip Deploy

If the only changes are in `docs/`, `.github/workflows/`, `*.md`, or test files, the deploy job exits early with a success status. No Docker operations at all.

### Health Check

After selective restart, verify the restarted service(s) are healthy:

- pops-api: `GET /health` returns 200
- pops-shell: nginx responds on port 80

### Fallback

If selective deploy fails (e.g., container won't start), fall back to full deploy as a recovery mechanism.

## API Dependencies

None — this is a CI/CD pipeline change, not an application feature.

## Business Rules

- Path detection uses `git diff --name-only HEAD~1..HEAD` on the merge commit
- A PR that touches both frontend and backend rebuilds both but NOT third-party images
- Infrastructure changes always trigger a full deploy (safe default)
- Unknown path patterns trigger a full deploy (safe default)
- The deploy workflow still supports manual `workflow_dispatch` which always does a full deploy
- Ansible vault secrets are only decrypted for full (infra) deploys
- Self-hosted runner executes Docker commands directly (no SSH, no Ansible for selective deploys)

## Edge Cases

| Case                                    | Behaviour                                                               |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Merge commit touches only docs          | Deploy skipped entirely, job reports success                            |
| PR touches frontend + infra             | Full deploy (infra always wins)                                         |
| Selective restart fails health check    | Falls back to full deploy                                               |
| Manual workflow_dispatch trigger        | Always full deploy                                                      |
| First deploy after runner setup         | Full deploy (no previous state)                                         |
| Docker build cache miss                 | Build takes longer but still selective                                  |
| Multiple PRs merged in rapid succession | Each triggers its own deploy; Docker layer caching reduces rebuild time |

## User Stories

| #   | Story                                                                     | Summary                                                                         | Status | Parallelisable   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-path-detection](us-01-path-detection.md)                           | Detect changed paths in merge commit, categorise as frontend/backend/infra/skip | Done   | Yes              |
| 02  | [us-02-selective-build](us-02-selective-build.md)                         | Build and restart only the changed service(s) via Docker commands               | Done   | Blocked by us-01 |
| 03  | [us-03-skip-deploy](us-03-skip-deploy.md)                                 | Skip deploy entirely for docs/CI-only changes                                   | Done   | Blocked by us-01 |
| 04  | [us-04-health-check](us-04-health-check.md)                               | Verify restarted services are healthy, fallback to full deploy on failure       | Done   | Blocked by us-02 |
| 05  | [us-05-ansible-runner-provisioning](us-05-ansible-runner-provisioning.md) | Add GitHub Actions runner setup to the Ansible provisioning playbook            | Done   | Yes              |

US-01 and US-05 can start in parallel. US-02 and US-03 depend on US-01. US-04 depends on US-02.

## Verification

- Frontend-only PR merges → only pops-shell rebuilt and restarted
- Backend-only PR merges → only pops-api rebuilt and restarted
- Docs-only PR merges → no deploy triggered
- Infra PR merges → full Ansible deploy
- Health check catches a broken container and triggers full deploy recovery
- Manual workflow_dispatch always does full deploy
- Runner provisioning via Ansible works on a fresh server

## Out of Scope

- Blue/green or canary deployments
- Rollback mechanism (revert the PR instead)
- Multi-environment deployment (staging, production)
- Container registry (images built locally on the server)
- Deployment notifications (Slack, email)

## Drift Check

last checked: 2026-04-17
