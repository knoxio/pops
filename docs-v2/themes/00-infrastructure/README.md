# Theme: Infrastructure

> Provision the hardware, networking, and deployment pipeline that runs everything.

## Strategic Objective

Set up a self-hosted production environment on dedicated hardware with zero-trust networking, automated deployment, encrypted backups, and container orchestration. Deployable from a single command, recoverable from backup, secured without exposing any ports to the public internet.

## Success Criteria

- A fresh Linux machine can be fully provisioned from Ansible playbooks
- All services run as Docker containers orchestrated by Docker Compose
- Cloudflare Tunnel + Access provides zero-trust external access with no port forwarding
- Secrets are managed via Ansible Vault (provisioning) and Docker secrets (runtime)
- CI/CD pipelines run quality gates before any deployment
- Encrypted backups to Backblaze B2 run on schedule
- A deployment can be rolled back to any previous version

## Epics

| # | Epic | Summary | Status |
|---|------|---------|--------|
| 0 | [Hardware & OS](epics/00-hardware-os.md) | N95 provisioning, OS hardening, SSH, firewall | Done |
| 1 | [Docker Runtime](epics/01-docker-runtime.md) | Docker Compose, multi-network architecture, health checks, volumes | Done |
| 2 | [Networking & Access](epics/02-networking-access.md) | Cloudflare Tunnel ingress, Cloudflare Access zero-trust auth | Done |
| 3 | [Secrets Management](epics/03-secrets-management.md) | Ansible Vault for provisioning, Docker secrets for runtime | Done |
| 4 | [CI/CD Pipelines](epics/04-cicd-pipelines.md) | GitHub Actions workflows for quality gates, deployment, validation | Done |
| 5 | [Backups](epics/05-backups.md) | Encrypted offsite to Backblaze B2 via rclone | Partial |
| 6 | [Monitoring](epics/06-monitoring.md) | Health checks, log aggregation, alerting | Done |
| 7 | [Database Operations](epics/07-database-operations.md) | Unified migration system, production guards, pre-migration backups, go-live runbook | Done |

Epics 0-2 are sequential (hardware before Docker before networking). Epics 3-6 can be parallelised after 1. Epic 7 depends on Epic 5 (backup system).

## Key Decisions

| Decision           | Choice                | Rationale                                                     |
| ------------------ | --------------------- | ------------------------------------------------------------- |
| Hardware           | Linux mini PC         | Low power, sufficient for single-user                         |
| Container runtime  | Docker Compose        | Simple, declarative, good enough for <10 services             |
| Ingress            | Cloudflare Tunnel     | Zero port forwarding, DDoS protection, free tier              |
| Auth               | Cloudflare Access     | Zero-trust, no self-hosted auth server                        |
| Provisioning       | Ansible               | Idempotent, declarative, secrets via Vault                    |
| CI/CD              | GitHub Actions        | Free for public repos, manual deploy trigger for safety       |
| Backups            | Backblaze B2 + rclone | Cheap, encrypted, S3-compatible                               |
| Deployment trigger | Manual only           | Self-hosted runner on production — never auto-deploy from PRs |

## Risks

- **Self-hosted runner compromise** — Compromised runner has access to production DB and secrets. Mitigation: manual deploy trigger only, never on PR events
- **Single point of failure** — One computer runs everything. Mitigation: encrypted backups, documented recovery
- **Cloudflare dependency** — If Cloudflare goes down, no external access. Mitigation: SSH for local network management, local network direct access to server bypassing cloudflare/login.

## Out of Scope

- Multi-server deployment or clustering
- Kubernetes or container orchestration beyond Docker Compose
- CDN or edge caching
- Automated scaling
