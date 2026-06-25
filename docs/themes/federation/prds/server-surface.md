# Server surface — `pillar()` for pillar-to-pillar calls

> Theme: [Federation](../README.md)
>
> Status: Done (built scope). Connection-pool tuning and end-to-end container tests are deferred — see [docs/ideas/server-surface.md](../../../ideas/server-surface.md).

## Purpose

A pillar, the orchestrator, the shell server, or a worker calling another pillar gets the same `pillar('id').router.proc(...)` proxy the browser client uses, with three server-only differences: it authenticates with a service-account key instead of a user session, it targets the registry-advertised internal hostname directly (no nginx hop), and it memoises the per-pillar handle in-process so a tight server loop does one registry fetch per discovery TTL.

The proxy shape, REST mechanics, OpenAPI route resolution, and failure-mode discriminants are inherited verbatim from the client surface (`@pops/pillar-sdk/client`). This surface re-exports that proxy, configured for server callers, and adds the auth/transport/caching layer plus a server-side sink-handler helper.

Shipped at `libs/sdk/src/server`, published as the `./server` subpath of `@pops/pillar-sdk`.

## Data Model

No persisted data. The surface holds two pieces of process-local state:

| State                                                                                        | Owner                        | Lifetime                                                                    |
| -------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `ServerSdkConfig` (api key, fetch impl, timeouts, registry overrides, internal base-URL map) | `config.ts` module singleton | Write-once at boot via `configureServerSdk`; shallow-merged on repeat calls |
| Per-pillar handle cache (keyed by pillarId + per-call options)                               | `factory.ts` `Map`           | Process lifetime; reset only by `__resetServerPillarCache` (tests)          |

## Contract / API Surface

```ts
// @pops/pillar-sdk/server

export function pillar<TRouter>(
  pillarId: string,
  options?: ServerPillarOptions
): PillarHandle<TRouter>;

export function configureServerSdk(config: ServerSdkConfig): void;
export function getServerSdkConfig(): Readonly<ServerSdkConfig>;
export function resolveApiKey(env?: NodeJS.ProcessEnv): string | undefined;
export const SERVER_SDK_API_KEY_ENV: 'POPS_INTERNAL_API_KEY';

export class PillarServerSdkError extends Error {}
export class InternalBaseUrlTransport implements DiscoveryTransport {}

export function createSinkHandler<T>(options: SinkHandlerOptions<T>): SinkHandler<T>;

// re-exported from ../client, identical semantics:
export { PillarCallError, PillarSdkError, isOk, isNotFound, isConflict, isBadRequest };
export type {
  PillarHandle,
  CallableProcedure,
  CallResult,
  CallSuccess,
  CallFailure,
  DiscoveredPillar,
  DiscoveryTransport,
  PillarClientOptions,
};
```

### `ServerSdkConfig`

| Field              | Type                             | Effect                                                                                                        |
| ------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apiKey`           | `string?`                        | Service-account key sent as `X-API-Key`. Explicit value wins over the env var. Empty string treated as unset. |
| `fetchImpl`        | `typeof fetch?`                  | Custom fetch — the seam for a keepalive-enabled fetch.                                                        |
| `callTimeoutMs`    | `number?`                        | Default per-call timeout for outbound requests.                                                               |
| `cacheTtlMs`       | `number?`                        | Registry discovery TTL.                                                                                       |
| `registry`         | `HttpDiscoveryTransportOptions?` | Registry transport overrides (internal hostname, timeout, headers).                                           |
| `internalBaseUrls` | `Record<string,string>?`         | Per-pillar base-URL override map, matched by `pillarId`.                                                      |

### `ServerPillarOptions` (per call)

`contractVersion` (major-version pin), plus `transport` / `fetchImpl` / `cacheTtlMs` as test escape hatches. Production callers configure once via `configureServerSdk` and let the memoised handle reuse them.

### Failure discriminants (inherited)

`CallResult<T>` is `{ kind: 'ok'; value: T }` or one of: `unavailable`, `degraded`, `contract-mismatch`, `not-found`, `conflict`, `bad-request`, `unauthorized` — each carrying `pillar` and, where relevant, `message`/`expected`/`actual`/`reason`.

## Rules

- **No nginx hop.** Server calls hit the registry-advertised `baseUrl` directly (e.g. `http://finance-api:3004`). The base URL is whatever the registry snapshot published — typically the in-cluster Docker hostname.
- **Auth is mandatory.** The first `pillar()` call throws `PillarServerSdkError` if no key resolves from config or `POPS_INTERNAL_API_KEY`. Server-to-server traffic is never anonymous; a missing key is a config bug, not a transient failure.
- **`X-API-Key` injected per call.** The key is resolved at call time (`authHeaders`), not at handle-build time, so a rotated env value is picked up on the next call without rebuilding the handle.
- **Handle memoisation.** `pillar('finance')` returns the same handle (and shares its discovery cache) across calls with matching config + options. The cache key folds pillarId, contractVersion, and whether a custom transport/fetch/TTL was passed; the config snapshot folds apiKey, fetch, timeouts, registry, and base-URL overrides. A changed configured api key rebuilds the handle.
- **Internal base-URL overrides are partial.** `InternalBaseUrlTransport` rewrites `baseUrl` only for pillars present in `internalBaseUrls`; everything else passes through untouched. It never mutates the inner snapshot entries.
- **Sinks are at-least-once.** `createSinkHandler` mounts `POST /_sinks/<eventType>`, validates the payload against the manifest's Zod schema, and delegates to an idempotent handler. Outcomes map to HTTP: `ok` → 200, `invalid-payload` → 400, `handler-failed` → 500 (dispatcher retries). The helper is framework-agnostic; the pillar's HTTP layer binds the route.

## Edge Cases

| Case                                                     | Behaviour                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POPS_INTERNAL_API_KEY` unset and no configured key      | First `pillar()` call throws `PillarServerSdkError`; message names both `POPS_INTERNAL_API_KEY` and `configureServerSdk`. |
| Env key rotated mid-process                              | Next call sends the new key — resolution happens per invocation.                                                          |
| Configured key changes via `configureServerSdk`          | Next `pillar()` rebuilds the handle (cache miss on config snapshot).                                                      |
| External `http://localhost:...` base URL (dev)           | Works via `internalBaseUrls` override + `InternalBaseUrlTransport`.                                                       |
| Pillar absent from registry snapshot                     | Call returns `{ kind: 'unavailable' }`.                                                                                   |
| Pillar contract major skew with `contractVersion` pinned | Call returns `{ kind: 'contract-mismatch' }`.                                                                             |
| 404 from the pillar                                      | Call returns `{ kind: 'not-found' }`.                                                                                     |
| Sink payload fails schema validation                     | `invoke` returns `invalid-payload` with Zod issues → 400.                                                                 |
| Sink handler throws                                      | `invoke` returns `handler-failed` → 500; dispatcher retries (handlers must dedupe).                                       |

## Acceptance Criteria

Audited against `libs/sdk/src/server` and `libs/sdk/src/server/__tests__`.

- [x] Server `pillar()` re-exports the client proxy (`PillarHandle`, `CallResult`, etc.) and ships behind the `./server` package subpath.
- [x] Auth source is the `POPS_INTERNAL_API_KEY` env var, overridable by `configureServerSdk({ apiKey })`; explicit config wins, empty string is unset (`config.test.ts`).
- [x] `X-API-Key: <key>` injected automatically on every outbound call (`factory.test.ts` — "sends the service-account key").
- [x] Key resolved at call time so a rotated env value is picked up without rebuilding the handle (`factory.test.ts` — "reads the env-supplied key at call time").
- [x] Base URL targets the registry-advertised internal hostname, never nginx (`factory.test.ts` — "does not pass through nginx", asserts `http://finance-api:3004/...`).
- [x] First call throws `PillarServerSdkError` when no key resolves; message names both knobs (`factory.test.ts` — auth-bootstrapping block).
- [x] `internalBaseUrls` override routes matching pillars to a dev URL and leaves non-matching pillars untouched; never mutates inner entries (`factory.test.ts` + `transport.test.ts`).
- [x] Per-pillar handle (and its discovery cache) reused across `pillar()` calls in-process; rebuilt when the configured key changes (`factory.test.ts` — handle-reuse block, asserts one registry fetch across two calls).
- [x] Error-mapping parity with the client surface — `unavailable`, `not-found`, `contract-mismatch` (`factory.test.ts` — error-parity block).
- [x] `createSinkHandler` mounts `/_sinks/<eventType>`, validates against the manifest schema, and maps `ok`/`invalid-payload`/`handler-failed` to 200/400/500 (`sinks.test.ts`).

## Out of Scope

- Service-mesh integration, circuit breaking, per-call retry policies (callers wrap themselves).
- Cross-pillar transaction coordination — handled above the SDK, not here.
- Multi-instance load balancing — single-instance assumption.
- Connection-pool tuning (`undici` agent, `poolSize`/`keepalive`) and end-to-end tests against a real/in-memory pillar container — deferred to [docs/ideas/server-surface.md](../../../ideas/server-surface.md).
