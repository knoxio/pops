# US-01: Repoint the nginx render's registry fetch to REST

> PRD: [PRD-255 — Production registry-driven nginx](README.md)

## Description

As the nginx render path, I want to read the registry snapshot from core's REST endpoint via the SDK's
`HttpDiscoveryTransport`, so that `gen:nginx:dynamic` works against current core (which serves no tRPC)
and the repo has one discovery client, not two.

## Acceptance Criteria

- [ ] The render path no longer references `/trpc/core.registry.list`. `rg -n 'trpc' apps/pops-shell/scripts` returns **0 hits**.
- [ ] `apps/pops-shell/scripts/nginx-registry-client.ts` (the hand-rolled tRPC client) is deleted; the dynamic render reads the snapshot through `@pops/pillar-sdk`'s `HttpDiscoveryTransport` (`GET /core.registry.list`).
- [ ] `renderNginxConfDynamic` consumes the `DiscoveredPillar[]` shape returned by the transport; `resolveUpstreamForEntry` behaviour is preserved (known ids → `PILLAR_UPSTREAMS` `host:port`; unknown ids → registry `baseUrl`).
- [ ] `pnpm --filter @pops/pops-shell gen:nginx:dynamic` against a running core renders a valid conf that includes every registered pillar (verified by `nginx -t` on the output).
- [ ] Existing generator tests stay green; the deterministic-render snapshot test (`generate-nginx-conf.test.ts`) is updated to the transport-backed path without weakening its assertions.

## Notes

This is the regression fix that unblocks the rest of PRD-255 — the dynamic render is currently broken
because core dropped tRPC during the lake migration (`pillars/core/src/api/app.ts:114` now serves REST
`GET /core.registry.list`). The transport already exists at
`packages/pillar-sdk/src/client/discovery.ts:51` and is tested against `http://core-api:3001/core.registry.list`;
prefer injecting its `registryUrl` from `POPS_REGISTRY_URL`. Do not add a second registry client.
