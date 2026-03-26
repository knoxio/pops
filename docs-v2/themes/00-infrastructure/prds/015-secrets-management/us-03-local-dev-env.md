# US-03: Local dev environment secrets

> PRD: [015 — Secrets Management](README.md)
> Status: To Review

## Description

As a developer, I want a `.env.example` and local secret loading pattern so that I can run POPS locally without Docker secrets.

## Acceptance Criteria

- [ ] `.env.example` at repo root with all required keys and placeholder values
- [ ] `.env` in `.gitignore`
- [ ] Application code supports both: `process.env.KEY` (dev) and `/run/secrets/key` (prod)
- [ ] `mise ansible:decrypt-env` generates `.env` from Ansible Vault for authorised developers
- [ ] Local dev works with just `.env` — no Docker secrets setup needed

## Notes

The dual reading pattern (env var OR secret file) should be a small utility function, not repeated in every service.
