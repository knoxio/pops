# PRD-015: Secrets Management

> Epic: [03 — Secrets Management](../../epics/03-secrets-management.md)
> Status: Done

## Overview

Set up the secrets pipeline: Ansible Vault for encrypted storage at rest, Docker file-based secrets for runtime injection. No secret ever lives in an environment variable or compose file in production.

## Secrets Flow

```
Ansible Vault (encrypted at rest)
  → /opt/pops/secrets/ (files on host, deployed by Ansible)
    → Docker Compose file-based secrets
      → /run/secrets/ (in containers, read-only)
```

## Secrets Inventory

| Secret | Used by | Description |
|--------|---------|-------------|
| `claude_api_key` | pops-api | Claude Haiku API for categorisation |
| `up_bank_token` | pops-api | Up Bank API access |
| `up_webhook_secret` | pops-api | Up Bank webhook signature validation |
| `finance_api_key` | pops-api | API auth key |
| `tmdb_api_key` | pops-api | TMDB movie metadata |
| `thetvdb_api_key` | pops-api | TheTVDB TV metadata |
| `paperless_secret_key` | paperless-ngx | Django secret key |
| `paperless_admin_password` | paperless-ngx | Admin login |
| `tunnel_credentials` | cloudflared | Cloudflare Tunnel auth |

## Business Rules

- Production: secrets via Docker file-based secrets (`/run/secrets/`), never environment variables
- Local dev: `.env` file (copy from `.env.example`), read via `process.env`
- Ansible Vault encrypts secrets at rest in the repo
- Vault password stored securely, never in the repo
- `.env`, `vault.yml` (decrypted), and secret files are in `.gitignore`

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-vault-setup](us-01-vault-setup.md) | Set up Ansible Vault with encrypted secrets file | Done | No (first) |
| 02 | [us-02-docker-secrets](us-02-docker-secrets.md) | Configure Docker Compose file-based secrets, update services to read from /run/secrets/ | Done | Blocked by us-01 |
| 03 | [us-03-local-dev-env](us-03-local-dev-env.md) | Create .env.example and local dev secret loading pattern | Done | Yes |

## Verification

- `ansible-vault view` shows decrypted secrets (with vault password)
- Deployed containers read secrets from `/run/secrets/`
- No secrets in docker-compose.yml or environment variables in production
- `.env.example` has all required keys with placeholder values
- Local dev works with `.env` file

## Out of Scope

- Secret rotation automation
- Key management services (KMS)
- Secret scanning in CI
