# US-02: Manual deploy workflow

> PRD: [016 — CI/CD Pipelines](README.md)
> Status: Partial

## Description

As an operator, I want a manual deploy workflow that runs quality gates then deploys to the server so that deployment is controlled and safe.

## Acceptance Criteria

- [ ] `root-deploy.yml` triggered only via `workflow_dispatch` (manual) — currently also triggers on push to main (see issue #1818)
- [x] Runs typecheck, lint, test, build as quality gates before deploy
- [x] If any gate fails, deployment is skipped
- [x] Deployment step SSHes to server and runs Ansible deploy playbook
- [x] Self-hosted runner used only for the deploy step
- [x] GitHub secrets configured for SSH key and server connection
- [x] Deployment verified — services restarted and healthy

## Notes

The self-hosted runner is on the production server — if a PR-triggered workflow ran on it, a fork could execute arbitrary code. Manual trigger only.
