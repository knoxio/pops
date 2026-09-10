# ADR-002: Shell Architecture

## Status

**Superseded** by [ADR-026](./adr-026-pillar-architecture.md) and [ADR-038](./adr-038-pillar-discovery-protocol.md) — 2026-08-01.

## What it decided

A single SPA with one workspace package per app under `packages/app-*`, imported by the shell as build-time dependencies and code-split per route by Vite. Module Federation was rejected as too much runtime overhead and infrastructure for the benefit.

## Why it no longer holds

`packages/` does not exist — each pillar ships its own frontend under `pillars/<id>/app`. The load-bearing change is the part this ADR chose deliberately: the build-time dependency. The shell now discovers surfaces from the live registry at runtime (ADR-038), so a pillar's frontend can join the fleet without the shell being rebuilt, which is exactly the independence Module Federation was rejected for.

The build-time dependency was removed in full by POPS-3227: `pillars/shell/package.json` declares no `@pops/app-*` dependency, and the `bundle-map.tsx` that held the static list is deleted. `scripts/check-pillar-ui-reachability.mjs` is the guard that keeps it that way — every `pillars/*/app` must advertise the `assetsBaseUrl` and `pages` the loader reads, because nothing else will mount it.

Stubbed deliberately: the full options table is in git history. Left inline, it described a `packages/` layout that no longer exists.
