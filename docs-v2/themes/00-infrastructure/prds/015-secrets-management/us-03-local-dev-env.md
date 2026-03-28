# US-03: Local dev environment secrets

> PRD: [015 — Secrets Management](README.md)
> Status: Done

## Description

As a developer, I want a `.env.example` and local secret loading pattern so that I can run POPS locally without Docker secrets.

## Acceptance Criteria

- [x] `.env.example` at repo root with all required keys and placeholder values
- [x] `.env` in `.gitignore`
- [x] Application code supports both: `process.env.KEY` (dev) and `/run/secrets/key` (prod)
- [x] `mise ansible:decrypt-env` generates `.env` from Ansible Vault for authorised developers
- [x] Local dev works with just `.env` — no Docker secrets setup needed

## Notes

The dual reading pattern (env var OR secret file) should be a small utility function, not repeated in every service.
