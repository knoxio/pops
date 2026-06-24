# Epic: CI/CD Pipelines

> Theme: [Platform](../README.md)

## Scope

GitHub Actions workflows for the pops repo. Two responsibilities: (1) quality gates on every PR — typecheck, lint, test, format, docker build, compose validate — and (2) image publishing to GHCR on every push to `main`. **No deployment step in this repo** — pops does not SSH to a server, does not provision hosts, does not use a self-hosted runner. Server-side rollout is the deployer's job (see `knoxio/homelab-infra`).

## PRDs

| PRD                                                                              | Summary                                                                                                                      | Status |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| [CI/CD Pipelines](../prds/cicd-pipelines/README.md)                              | Disk-discovered per-unit quality matrices over `pillars/*` + `libs/*`, collapsed to one required `CI Gate` aggregator        | Done   |
| [Application Packaging & GHCR Contract](../prds/application-packaging/README.md) | publish-images.yml, `infra/docker-compose.yml` as the public deployment artifact, secrets layout, Watchtower hook in compose | Done   |

## Dependencies

- **Requires:** Nothing in this repo (CI runs on `ubuntu-latest`, no host required)
- **Consumed by:** Any deployer of pops, including `knoxio/homelab-infra`

## Out of Scope

- Server-side deployment (Watchtower, owned by the deployer)
- Host provisioning (the deployer's responsibility, e.g. `homelab-infra`)
- Self-hosted runners (a deployer concern, not pops CI)
- Blue/green or canary deployments
