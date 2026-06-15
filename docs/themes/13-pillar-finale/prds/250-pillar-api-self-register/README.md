# PRD-250: Per-pillar API self-registration on boot

> Epic: [Cross-pillar federation](../../epics/05-federation.md) (or closest existing — index to be confirmed)
>
> Status: **In progress**

## Overview

The `pillar-sdk` discovery layer (used by `pops-mcp` and by every cross-pillar SDK consumer) reads the live pillar list from `pops-core-api`'s heartbeat-driven registry via tRPC `core.registry.list`. That registry is fed by pillars POST-ing their manifest to `/core.registry.register` at boot, with heartbeats keeping the row fresh (PRD-228 US-01/US-02).

Today only `pops-shell` actually does this. Every other pillar API has the bootstrap code in `server.ts`:

```ts
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({ manifest: buildXManifest(version) });
}
```

…but `POPS_REGISTRY_ENABLED` is not set in the compose for any of them. Net: the registry contains 0 dynamic entries, every MCP `tools/call` returns `Pillar 'X' is unavailable`.

This PRD turns the gate on.

## Surface

| Surface                                                                                                                                                  | Change                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `homelab-infra/hosts/capivara/stacks/pops/docker-compose.yml` — each `pops-*-api` service block (core, inventory, media, finance, food, lists, cerebrum) | Add `POPS_REGISTRY_ENABLED: 'true'`. `POPS_REGISTRY_URL` defaults to `http://core-api:3001` in the SDK, so it can stay implicit unless a non-default is wanted.                                           |
| Pillar API source code                                                                                                                                   | No change. The bootstrap code is already in every `server.ts`.                                                                                                                                            |
| `bootstrap` transport (`packages/pillar-sdk/src/bootstrap/transport.ts`)                                                                                 | No change. Per the core-api router comment, `/core.registry.register` is "internal-only, blocked at nginx" — auth is the docker-network boundary, the SDK transport intentionally posts un-authenticated. |

## Business Rules

- **No new code coupling.** Each pillar API already imports `bootstrapPillar` from `@pops/pillar-sdk/bootstrap` and already has its own `buildXManifest(version)`. This PRD changes one env var per service.
- **Best-effort, non-fatal.** `bootstrapPillar` includes retry-with-backoff (5 attempts, exponential). If core-api is unreachable at boot, the pillar still serves traffic; the next heartbeat tick eventually re-registers.
- **Inverse for shutdown.** SIGTERM calls `pillarHandle.stop()`, which sends an explicit deregister before the HTTP server closes. Already wired in every `server.ts`.
- **Order matters at first boot.** Pillars depend on core-api being healthy before they can register. The compose already has `depends_on: pops-redis: service_healthy` on each pillar; this PRD adds `depends_on: core-api: service_healthy` on the six non-core pillars (core-api is its own registry, so it self-references after `app.listen`).

## Edge Cases

| Case                                             | Behaviour                                                                                                                                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core-api restarts                                | Per PRD-228 US-02, heartbeats land in the persisted `pillar_registry` table; on restart, `reconcileRegistryOnBoot` marks rows as `unknown` based on heartbeat age, and the next heartbeat (within ~10s) flips them back to `healthy`. No data loss. |
| Pillar restarts (e.g. watchtower image rollover) | Pillar runs `pillarHandle.stop()` on SIGTERM → explicit deregister → row marked dropped. New container boots → registers fresh.                                                                                                                     |
| Network partition between pillar and core-api    | Pillar boot blocks for up to 5 retry attempts (default max-backoff 30s). If still failing, the pillar starts serving requests without being registered; MCP tool calls to it fail with `unavailable` until the next heartbeat tick succeeds.        |
| Two pillar instances claim the same `pillarId`   | Out of scope — multi-instance is an ADR-027 follow-up. Single-instance per pillar on capivara today.                                                                                                                                                |

## Acceptance Criteria

Tracked inline (no US-NN split — single-deliverable PRD per [docs/CLAUDE.md](../../../CLAUDE.md)):

- [ ] `homelab-infra` compose: every `pops-*-api` service block has `POPS_REGISTRY_ENABLED: 'true'` and `depends_on` includes `core-api: service_healthy` (except core-api itself).
- [ ] After redeploy on capivara: `curl http://core-api:3001/trpc/core.registry.list` from inside the docker network returns all 7 pillars with `status: 'healthy'`.
- [ ] `pops-mcp` `tools/call` for one tool per pillar (e.g. `cerebrum.engrams.list`, `inventory.items.list`, `finance.transactions.list`, `media.library.list`) returns a real payload, not `Pillar 'X' is unavailable`.
- [ ] Pillar restarts (kill + start) re-register within 30 seconds.
- [ ] No code changes in the pops repo.

## Out of Scope

- **Authentication on `/core.registry.register`.** The router comment says "blocked at nginx"; verifying nginx config actually enforces this is a separate cleanup if a smell turns up.
- **Multi-instance pillar registry semantics.** ADR-027 follow-up.
- **Pillar `/manifest` HTTP exposure.** PRD-241 US-01 added manifest exports in code; exposing them as a public HTTP endpoint is a different PRD — not needed for self-register since `bootstrapPillar` builds the manifest in-process.

## References

- [PRD-228](../228-dynamic-pillar-registration/README.md) — defines the register/heartbeat/deregister handshake this PRD finishes activating
- [PRD-241](../241-registry-driven-known-modules/README.md) US-01 — per-pillar manifest exports (the `buildXManifest()` functions this PRD relies on)
- `packages/pillar-sdk/src/bootstrap/bootstrap.ts` — the `bootstrapPillar` helper each pillar already uses
- `apps/pops-cerebrum-api/src/server.ts:50` — example of the existing gated bootstrap call
- `apps/pops-shell/src/lib/register-with-registry.ts` — shell's analogous gate (already on)
- [ADR-026 — Pillar architecture](../../../../architecture/adr-026-pillar-architecture.md)
- [ADR-027 — Runtime pillar registry](../../../../architecture/adr-027-runtime-pillar-registry.md)
