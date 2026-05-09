# US-03: Shell manifest endpoint

> PRD: [Module Runtime — Tier 1](README.md)
> Status: In progress

## Description

As a frontend, I want one read-path that tells me which modules are installed so that I don't need to probe each module individually.

## Acceptance Criteria

- [ ] `core.shell.manifest()` tRPC query returns `{ apps: string[], overlays: string[] }`.
- [ ] OpenAPI mirror at `GET /api/v1/shell/manifest` returns the same payload.
- [ ] The query reads `POPS_APPS` / `POPS_OVERLAYS` directly via `readInstalledModules()`.
- [ ] The endpoint is itself ungated (it's under `core.*`).

## Notes

- Output schema is intentionally typed as `string[]`, not `(AppId|OverlayId)[]`, so the frontend doesn't have to ship the union type. The frontend uses string membership checks.
