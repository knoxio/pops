# PRD-227: SDK consumer migration audit

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)

## Overview

Catalogue every call site that currently issues HTTP / tRPC against a per-pillar router and assign each one a migration target on the unified `@pops/pillar-sdk` consumption surface (PRD-191 client, PRD-192 server, PRD-193 React hooks). Records preconditions so the consumer migrations can be parallelised against the right wave gate.

## Data Model

No persistent data. The deliverable is the punch list below plus the per-PR migration tickets it spawns.

## API Surface

| SDK surface         | Source                              | Used by                              |
| ------------------- | ----------------------------------- | ------------------------------------ |
| `pillar()`          | `@pops/pillar-sdk/client` (PRD-191) | Node consumers (workers, MCP, CLI)   |
| `pillar()` + auth   | `@pops/pillar-sdk/server` (PRD-192) | Sibling-pillar containers, search/AI |
| `usePillarQuery`    | `@pops/pillar-sdk/react` (PRD-193)  | `pops-shell`, `packages/app-*`       |
| `usePillarMutation` | `@pops/pillar-sdk/react` (PRD-193)  | `pops-shell`, `packages/app-*`       |
| `PillarSdkProvider` | `@pops/pillar-sdk/react` (PRD-215)  | `pops-shell` root                    |

## Consumer punch list

### Frontend — `apps/pops-shell/src/`

| Call site                                          | Current                                  | Target                                                      | Blocker                                  |
| -------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `app/IndexRedirect.tsx`                            | `trpc.core.shell.manifest.useQuery`      | `usePillarQuery('core', ['shell','manifest'], undefined)`   | core writer move complete                |
| `app/capture/CaptureHotkeyHost.tsx`                | `trpc.core.settings.get.useQuery`        | `usePillarQuery('core', ['settings','get'], { key })`       | core writer move                         |
| `app/layout/top-bar/NudgeIndicator.tsx`            | `trpc.cerebrum.nudges.list.useQuery`     | `usePillarQuery('cerebrum', ['nudges','list'], …)`          | none — `cerebrum-api` already owns route |
| `app/pages/features-page/use-feature-mutations.ts` | 3× `trpc.core.features.*.useMutation`    | `usePillarMutation('core', ['features',…])`                 | core writer move                         |
| `app/pages/features-page/FeaturesPage.tsx`         | 2× `trpc.core.features.*.useQuery`       | `usePillarQuery('core', …)`                                 | core writer move                         |
| `components/settings/SectionRenderer.tsx`          | `trpc.core.settings.getBulk` + `setBulk` | `usePillarQuery` + `usePillarMutation` on `core`            | core writer move                         |
| `lib/use-feature-enabled.ts`                       | `trpc.core.features.isEnabled.useQuery`  | `usePillarQuery('core', ['features','isEnabled'], { key })` | core writer move                         |

### Frontend — `packages/app-*`

Total surface (raw `trpc.<pillar>.*` references): **453**.

| Package         | Call sites | Pillars touched    | Blockers                                   |
| --------------- | ---------: | ------------------ | ------------------------------------------ |
| `app-finance`   |       ~110 | `finance` (mostly) | finance writer move complete — migrate now |
| `app-media`     |       ~140 | `media`            | media writer cutover — Wave 3              |
| `app-food`      |        ~80 | `food`             | food writer cutover — Wave 3               |
| `app-inventory` |        ~50 | `inventory`        | inventory writer cutover — Wave 3          |
| `app-cerebrum`  |        ~50 | `cerebrum`         | cerebrum writer cutover — Wave 3           |
| `app-lists`     |        ~25 | `lists`            | lists writer cutover — Wave 3              |

Each `app-*` package migrates as a single PR per pillar once its writer move PR lands.

### Node — `apps/pops-mcp/src/`

| Tool file                        | Calls                                        | Target                                                   | Blocker                                                        |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `tools/inventory-locations.ts`   | 5× `inventory.locations.*`                   | `pillar('inventory').locations.*`                        | `core.registry.snapshot` precondition (PRD-161 alignment)      |
| `tools/inventory-items.ts`       | `inventory.items.*` read                     | `pillar('inventory').items.*`                            | inventory-api items module migration                           |
| `tools/inventory-items-write.ts` | `inventory.items.{create,update,…}`          | `pillar('inventory').items.*`                            | inventory-api items module migration                           |
| `tools/inventory-fixtures*.ts`   | `inventory.fixtures.*`                       | `pillar('inventory').fixtures.*`                         | inventory-api fixtures module migration                        |
| `tools/inventory-connections.ts` | `inventory.connections.*`                    | `pillar('inventory').connections.*`                      | inventory-api connections migration                            |
| `tools/cerebrum.ts`              | `cerebrum.engrams.*`, `…retrieval.*`         | `pillar('cerebrum').engrams.*`, `retrieval.*`            | engrams + retrieval not in cerebrum-api yet                    |
| `tools/finance.ts`               | `finance.*` reads                            | `pillar('finance').…`                                    | finance writer move complete — migrate now                     |
| `tools/media.ts`                 | `media.*`                                    | `pillar('media').…`                                      | media writer cutover                                           |
| `client.ts` (shared)             | `createTRPCClient<AppRouter>` w/ `x-api-key` | replace with `pillar()` factory wired with `authHeaders` | requires `core.registry.snapshot` to exist (PRD-161 alignment) |

### Node — `apps/pops-worker-food/src/`

| Call site       | Calls                        | Target                                 | Blocker                                |
| --------------- | ---------------------------- | -------------------------------------- | -------------------------------------- |
| `api-client.ts` | `food.ingest.workerComplete` | `pillar('food').ingest.workerComplete` | `food.ingest.*` still in pops-api mono |

### Node — `apps/pops-api/src/cli/`

| Call site        | Calls                                 | Target                            | Blocker                              |
| ---------------- | ------------------------------------- | --------------------------------- | ------------------------------------ |
| `cli/ego.ts`     | `core.embeddings.query` (and similar) | `pillar('core').embeddings.query` | core writer move + registry endpoint |
| `cli/capture.ts` | `core.entities.*`, `core.uri.handle`  | `pillar('core').…`                | core writer move + registry endpoint |

### Node — sibling-pillar fan-out (server SDK)

Today: zero sibling-pillar fan-out goes through `pillar()`. Each pillar API still reaches sibling data via shared SQLite handles or via pops-api round-trips.

| Surface                                              | Target                                               | Blocker                                              |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `pops-search-api` federated query (Epic 06, PRD-197) | `pillar('media').search`, `pillar('food').search`, … | PRDs 196–199 — server-SDK call shape is the contract |
| `pops-ai-api` tool routing (Epic 07, PRD-202)        | `pillar('<id>').<tool>`                              | PRDs 200–202 — same                                  |

## Preconditions

- **`core.registry.snapshot`** must exist in `pops-core-api`. The SDK's `HttpDiscoveryTransport` calls `core.registry.snapshot`; today `pops-core-api` exposes `core.registry.list` instead. Either align the SDK to `list` or expose `snapshot` — pick one before any consumer adopts `pillar()`.
- **Browser-reachable `baseUrl`s.** Registry entries currently advertise container-network origins (e.g. `http://cerebrum-api:3007`). The browser cannot reach those. The SDK on the FE needs either a transport that rewrites `baseUrl` to the `/trpc-<id>` nginx prefix, or the registry must publish browser-side URLs alongside the container ones.
- **URL shape parity with nginx dispatcher.** The SDK builds `${baseUrl}/trpc/${pillarId}.${path}`. The dispatcher rewrites `/trpc-<id>/(.*)$ → /trpc/$1`. With `baseUrl = '/trpc-<id>'` the result is `/trpc-<id>/trpc/<path>` which double-prefixes. The SDK should either drop the `/trpc/` segment when `baseUrl` already names a tRPC mount, or the FE-side `baseUrl` must be `''` (pointing at the legacy pops-api mono) until per-pillar dispatcher rules align.

## Migration order

1. Land `core.registry.snapshot` (or align SDK to `list`).
2. Land `PillarSdkProvider` in `pops-shell` root with a transport that knows about browser-reachable URLs.
3. Migrate one read-only FE component as the canary (recommended: `NudgeIndicator` because cerebrum-api owns the route and the call has no side effects).
4. Wave 4 in parallel — one PR per `app-*` package against its pillar.
5. Node side: migrate `pops-mcp` (one tool file per PR), `pops-worker-food`, and `apps/pops-api/cli/` once their target routes leave the mono.
6. Retire the `@pops/api-client` `splitLink` once every FE call site uses hooks (PRD-218 territory).

## Business Rules

- One PR per consumer file. No PR mixes shell wiring with consumer migration.
- Canary FE migration ships behind no flag — the call replaces the existing `trpc.*` invocation atomically.
- Tests that mock the old tRPC client are updated alongside the migration; no dual-client mocks.

## Edge Cases

| Case                                                | Behaviour                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar manifest does not advertise the called route | SDK returns `{ kind: 'contract-mismatch' }`; the React hook surfaces `isContractMismatch`. The component must render a fallback or the call needs to wait for the pillar to ship the route. |
| Registry snapshot is stale                          | Discovery cache TTL (default 60s) hides churn; the subscription bridge invalidates on `pillar.registered` / `pillar.deregistered` events.                                                   |
| Auth header missing                                 | `pops-mcp` and `pops-worker-food` must thread `authHeaders` through the SDK options. Failure surfaces as `kind: 'unavailable'`.                                                             |

## User Stories

| #   | Story                                       | Summary                                                                     | Parallelisable           |
| --- | ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| 01  | [us-01-shell-wiring](us-01-shell-wiring.md) | Add `PillarSdkProvider` to `pops-shell` with a browser-reachable transport. | Blocked by preconditions |
| 02  | [us-02-fe-canary](us-02-fe-canary.md)       | Migrate `NudgeIndicator.tsx` to `usePillarQuery` as the FE canary.          | Blocked by us-01         |
| 03  | [us-03-mcp-canary](us-03-mcp-canary.md)     | Migrate one `pops-mcp` tool file (`inventory-locations.ts`) to `pillar()`.  | Blocked by preconditions |

## Out of Scope

- Renaming `core.corrections.*` / `core.tagRules.*` to `finance.*` (PRDs 203–205 own that).
- nginx dispatcher generation (PRD-217).
- `PillarGuard` rewrite (PRD-216).
- New pillar routes — this PRD only repoints existing calls.
