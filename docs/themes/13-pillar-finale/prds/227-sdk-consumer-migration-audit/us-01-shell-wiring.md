# US-01: Wire `PillarSdkProvider` into `pops-shell`

> PRD: [SDK consumer migration audit](README.md)

## Description

As a shell developer, I want a `PillarSdkProvider` mounted at the root of `pops-shell` so that any component can pull data through `usePillarQuery` / `usePillarMutation` without each call site reconstructing transport, auth headers, or registry config.

## Acceptance Criteria

- [ ] `apps/pops-shell/src/app/App.tsx` mounts `<PillarSdkProvider>` inside the existing `<QueryClientProvider>` and outside `<PillarStatusProvider>`.
- [ ] The provider is configured with a `DiscoveryTransport` that consults a browser-reachable URL (`/pillars/snapshot` or equivalent) and yields entries whose `baseUrl` resolves through nginx to the matching pillar API.
- [ ] SDK requests stay same-origin (routed through nginx) so the browser sends the session cookie automatically; `authHeaders` is reserved for `X-API-Key` (and similar non-cookie credentials) for parity with the existing `@pops/api-client` chain.
- [ ] Subscription bridge is enabled (`subscribe: true`) so registry events invalidate React Query caches under the matching pillar prefix.
- [ ] A vitest in `apps/pops-shell/src/app/__tests__/` confirms that a child component calling `usePillarQuery` receives the seeded transport's data (no real HTTP).
- [ ] `pnpm --filter @pops/shell typecheck` + `pnpm --filter @pops/shell test` pass.

## Notes

The transport wrapper lives in `apps/pops-shell/src/lib/pillar-sdk-transport.ts` so it's reusable for tests. It depends on `core.registry.snapshot` (or `core.registry.list` if the SDK is realigned). The wrapper must map registry `baseUrl` container-network origins to the `/trpc-<id>` browser path. Do **not** import from `@pops/pillar-sdk/server` — the shell is a browser bundle.
