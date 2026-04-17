# US-02: Deploy workflow

> PRD: [016 — CI/CD Pipelines](README.md)
> Status: Done

## Description

As an operator, I want a deploy workflow that runs quality gates then deploys to the server on push to main, so that every merge to main is automatically delivered.

## Acceptance Criteria

- [x] `root-deploy.yml` triggers on push to main and via `workflow_dispatch`
- [x] Runs typecheck, lint, test, build as quality gates before deploy
- [x] If any gate fails, deployment is skipped
- [x] Deployment step SSHes to server and runs Ansible deploy playbook
- [x] Self-hosted runner used only for the deploy step
- [x] GitHub secrets configured for SSH key and server connection
- [x] Deployment verified — services restarted and healthy

## Notes

The self-hosted runner runs on the production server — used only for the final deploy step. PR-triggered quality workflows run on GitHub-hosted runners. Push-to-main triggers the deploy for any actor with push access to main — branch protection and required review rules control who can reach that state.
