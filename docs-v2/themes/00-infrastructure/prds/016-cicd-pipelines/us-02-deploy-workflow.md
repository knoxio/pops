# US-02: Manual deploy workflow

> PRD: [016 — CI/CD Pipelines](README.md)
> Status: To Review

## Description

As an operator, I want a manual deploy workflow that runs quality gates then deploys to the server so that deployment is controlled and safe.

## Acceptance Criteria

- [ ] `deploy.yml` triggered only via `workflow_dispatch` (manual)
- [ ] Runs typecheck, lint, test, build as quality gates before deploy
- [ ] If any gate fails, deployment is skipped
- [ ] Deployment step SSHes to server and runs Ansible deploy playbook
- [ ] Self-hosted runner used only for the deploy step
- [ ] GitHub secrets configured for SSH key and server connection
- [ ] Deployment verified — services restarted and healthy

## Notes

The self-hosted runner is on the production server — if a PR-triggered workflow ran on it, a fork could execute arbitrary code. Manual trigger only.
