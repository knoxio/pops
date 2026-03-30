# Epic 03: Secrets Management

> Theme: [Infrastructure](../README.md)

## Scope

Set up the secrets pipeline: Ansible Vault for encrypted storage at rest, Docker file-based secrets for runtime injection. No secret ever lives in an environment variable or compose file in production.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 015 | [Secrets Management](../prds/015-secrets-management/README.md) | Ansible Vault encryption, Docker secrets configuration, secret file deployment to host, container consumption via /run/secrets/ | Done |

## Dependencies

- **Requires:** Epic 01 (Docker Compose must be configured)
- **Unlocks:** Secure deployment of all services that need API keys or credentials

## Out of Scope

- Application-level secret rotation
- Key management services (AWS KMS, etc.)
- Secret scanning in CI
