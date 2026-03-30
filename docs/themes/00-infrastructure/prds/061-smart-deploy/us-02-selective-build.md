# US-02: Selective Docker build and restart

> PRD: [061 — Smart Deploy Pipeline](README.md)
> Status: Done

## Description

As a developer, I want the deploy to only rebuild and restart services that changed so that deploys are fast for typical single-service changes.

## Acceptance Criteria

- [ ] Deploy job reads outputs from path detection (us-01)
- [ ] If `frontend` is true and `infra` is false: run `docker compose build pops-shell && docker compose up -d pops-shell`
- [ ] If `backend` is true and `infra` is false: run `docker compose build pops-api && docker compose up -d pops-api`
- [ ] If both `frontend` and `backend` are true: build and restart both (but not third-party images)
- [ ] If `infra` is true: run full Ansible deploy (current behaviour)
- [ ] Docker commands run in the compose directory on the N95 (`/opt/pops`)
- [ ] Git pull runs before any build to get latest code
- [ ] Docker layer caching reduces rebuild time for incremental changes
- [ ] Manual `workflow_dispatch` always triggers full deploy regardless of path detection
- [ ] Deploy step logs which mode is running: "Selective deploy: frontend only" / "Full deploy"

## Notes

The selective path uses direct Docker commands (no Ansible) since Ansible's value is in templating + secrets, which aren't needed for a simple image rebuild. The compose directory and project name must match what Ansible set up. The git pull step uses the same repo checkout that Ansible's `git` module would do.
