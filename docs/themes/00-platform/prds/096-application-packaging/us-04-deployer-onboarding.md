# US-04: README documents the secrets layout + minimum env for any deployer

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Done

## Goal

The README's `## Deploy` section must give a stranger enough to stand up pops on their own Docker host: clone, copy `.env`, populate `secrets/`, pull, up. No reference to ansible, no internal tooling.

## Acceptance Criteria

- [x] `## Deploy` block in `README.md` shows the full minimum sequence (clone → env → secrets → pull → up)
- [x] All 10 required `secrets/<name>` files are listed (with note that empty is allowed for unused integrations)
- [x] `POPS_IMAGE_TAG` override documented for pinning / rollback
- [x] Reference to dev compose for local builds
- [x] Forward-pointer to `homelab-infra` for the knoxio-specific provisioning, with a clear "you don't need it to run pops" framing
