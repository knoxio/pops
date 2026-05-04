# Epic 00: CI/CD Pipelines

> Theme: [Platform](../README.md)

## Scope

GitHub Actions workflows for the pops repo. Two responsibilities: (1) quality gates on every PR — typecheck, lint, test, format, docker build, compose validate — and (2) image publishing to GHCR on every push to `main`. **No deployment step in this repo** — pops does not SSH to a server, does not run ansible, does not use a self-hosted runner. Server-side rollout is Watchtower's job (see PRD-095 in `homelab-infra`).

## PRDs

| #   | PRD                                                                                  | Summary                                                                                                                    | Status      |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 016 | [CI/CD Pipelines](../prds/016-cicd-pipelines/README.md)                              | Per-area quality workflows (api, shell, app-\*, ui, db-types, tools), umbrella quality.yml                                 | Done        |
| 096 | [Application Packaging & GHCR Contract](../prds/096-application-packaging/README.md) | publish-images.yml, infra/docker-compose.yml as the public deployment artifact, secrets layout, Watchtower hook in compose | In progress |

## Dependencies

- **Requires:** Nothing in this repo (CI runs on `ubuntu-latest`, no host required)
- **Consumed by:** Any deployer of pops, including `knoxio/homelab-infra`

## Out of Scope

- Server-side deployment (Watchtower in homelab-infra)
- Ansible / vault / host provisioning (homelab-infra)
- Self-hosted runners (used by homelab-infra, not pops)
- Blue/green or canary deployments
