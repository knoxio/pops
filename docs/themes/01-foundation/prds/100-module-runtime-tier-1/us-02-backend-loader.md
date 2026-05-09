# US-02: Backend module gate

> PRD: [Module Runtime — Tier 1](README.md)
> Status: In progress

## Description

As a deployment, I want tRPC procedures for absent modules to return `NOT_FOUND` so that an operator running `POPS_APPS=finance` cannot accidentally serve media or cerebrum data.

## Acceptance Criteria

- [ ] A `moduleGate` middleware in `apps/pops-api/src/trpc.ts` inspects each procedure's `path` on call.
- [ ] If the top-level router id is in the optional-apps set and absent from `POPS_APPS`, throw `TRPCError({ code: 'NOT_FOUND' })`.
- [ ] Same gate applies to overlays via `POPS_OVERLAYS`.
- [ ] `core.*` procedures are never gated.
- [ ] Default (env unset) installs everything — existing deployments are unaffected.
- [ ] Tests cover: default behaviour, single-app install rejecting absent modules, overlay gating.

## Notes

- The gate is a procedure middleware, not a per-router wrapper; the static `appRouter` shape is unchanged so the `AppRouter` type stays intact for the frontend client.
- Migrations are not gated in Tier 1 — they run for every module on every boot.
