# US-02: Configure Docker secrets

> PRD: [015 — Secrets Management](README.md)
> Status: To Review

## Description

As an operator, I want Docker Compose configured with file-based secrets so that containers read credentials from `/run/secrets/` instead of environment variables.

## Acceptance Criteria

- [ ] `secrets:` section in docker-compose.yml defines all secrets with `file:` pointing to `/opt/pops/secrets/`
- [ ] Each service declares which secrets it needs
- [ ] Application code reads secrets from `/run/secrets/<name>` in production
- [ ] No secrets in `environment:` section of docker-compose.yml
- [ ] Containers can read their secrets on startup

## Notes

Docker secrets mount as files at `/run/secrets/<name>` inside the container. Application code needs to read the file, not an env var. The dev/prod distinction: dev reads from `process.env`, prod reads from the file.
