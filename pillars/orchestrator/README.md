# @pops/orchestrator

The **orchestrator** pillar — a cross-pillar service that federates over the
data pillars via `@pops/pillar-sdk` (REST). It owns **no domain database**. Port
**3009**.

Like every pillar, it self-registers with the `registry` pillar on boot (opt-in
via `POPS_REGISTRY_ENABLED`, using `bootstrapPillar` from `@pops/pillar-sdk`)
and exposes `/health` plus a federated `/pillars` view.

## What it provides

- `src/search/` — federated search across the registered pillars.
- `src/ai-tools/` — the AI-tool registry assembled from pillar manifests.
- `src/pillars/` — the federated pillar view backing `/pillars`.

It is the cross-pillar composition layer: it reads each pillar's public contract
through the SDK rather than reaching into any pillar's internals.

## Layout

```
pillars/orchestrator/
├── package.json            @pops/orchestrator
├── Dockerfile
├── mise.toml               per-pillar tasks
└── src/
    ├── server.ts           HTTP entrypoint (port 3009)
    ├── app.ts              Express app wiring
    ├── handlers.ts
    ├── manifest.ts         the orchestrator's own manifest
    ├── search/             federated search
    ├── ai-tools/           AI-tool registry
    └── pillars/            federated /pillars view
```

## Commands

```bash
pnpm --filter @pops/orchestrator typecheck
pnpm --filter @pops/orchestrator test
pnpm --filter @pops/orchestrator dev
```
