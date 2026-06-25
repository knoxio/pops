# @pops/shell

The **shell** pillar — the single Vite/React SPA host for POPS. It lazy-loads
each domain's feature app and renders the federated navigation assembled from
the live registry. It is a **UI pillar**: it owns no SQLite DB and serves no
data procedures. Its manifest carries a sentinel contract block plus empty
capability arrays — the registry's manifest schema requires those fields, so a
UI pillar fills them with empties rather than dropping them. It still announces
itself to the `registry` pillar so the federation has one dynamic list of every
running surface — UI included.

The frontend source lives in `pillars/shell/src` (`main.tsx`, `components/`,
`store/`, `i18n/`, `registry-api/`). The production image is `nginx:alpine`
serving the built bundle; there is no Node at request time.

## UI-pillar registration

A UI pillar registers exactly like a data pillar, but every capability array is
empty — no procedures, no search/AI/uri contributions, no consumed settings.
The `ManifestPayloadSchema` (in `@pops/pillar-sdk`) is `.strict()` and requires
`contract`, `routes`, `search`, `ai`, `uri`, `consumedSettings`, and
`healthcheck`, so `buildShellManifest()` emits all of them — empties plus a
sentinel contract triplet — rather than omitting them:

```jsonc
{
  "pillarId": "shell",
  "baseUrl": "https://pops.local",
  "manifest": {
    "pillar": "shell",
    "version": "0.1.0",
    "contract": {
      "package": "@pops/shell",
      "version": "0.1.0",
      "tag": "contract-shell@v0.1.0",
    },
    "routes": { "queries": [], "mutations": [], "subscriptions": [] },
    "search": { "adapters": [] },
    "ai": { "tools": [] },
    "uri": { "types": [] },
    "consumedSettings": { "keys": [] },
    "healthcheck": { "path": "/health" },
  },
  "apiKey": "<POPS_INTERNAL_API_KEY>",
}
```

`manifest.pillar` MUST equal `pillarId` — the registry rejects a mismatch. The
sentinel `contract.package` is a placeholder that need not exist in the
workspace; it only has to satisfy the cross-field validator
(`checkContractPackageMatchesPillar`), which requires the package to equal
`@pops/<pillar>` (the collapsed form shown above is the simplest value that
passes). `sinks` and the other UI-only blocks (`settings`, `nav`, `pages`,
`features`, …) are optional in the schema, so a UI pillar omits those.

### Registration runs at deploy time, not in the browser

The shell registers via a Node CLI, never from the browser bundle:

- the shared `POPS_INTERNAL_API_KEY` (the docker-network trust boundary) must
  not reach the client bundle;
- the runtime image is `nginx:alpine` with no Node, so registration happens at
  deploy time.

The CLI entrypoint `scripts/register-with-registry.ts` delegates to
`registerShellWithRegistry` in `src/lib/register-with-registry.ts`. Run it with
the same secrets every other pillar uses:

```bash
POPS_REGISTRY_URL=http://registry-api:3001 \
SHELL_BASE_URL=https://pops.local \
POPS_INTERNAL_API_KEY=… \
  pnpm --filter @pops/shell registry:register
```

> Endpoint note: `src/lib/register-with-registry.ts` POSTs to
> `/core.registry.register`. The `registry` pillar mounts every registry
> operation on both that path and the canonical `/registry/register` (see the
> pillar SDK's `REGISTRY_PATHS` / `LEGACY_REGISTRY_PATHS`), so either resolves.

Behaviour (always exits `0` so a partially-configured deploy still boots):

- **All env vars present** → POSTs to the registry, returns
  `{ kind: 'registered', pillarId, registeredAt }`.
- **Any env var missing** → silent skip
  (`{ kind: 'skipped', reason: 'missing-env', missing: [...] }`).
- **Registry unreachable** → logs a warning, returns `{ kind: 'unreachable' }`.
  Registration is best-effort: a UI pillar that fails to announce itself is
  degraded, not broken.
- **Registry returns non-2xx** → `{ kind: 'failed', status, body }` with the
  structured error payload (e.g. `{ ok: false, reason: 'invalid-api-key' }`).

### Reusing this pattern for iOS / kiosk / future UI surfaces

A new UI surface copies the two pieces in `pillars/shell`:

1. `src/lib/register-with-registry.ts` — the pure registration function with
   deps-injected transport + logger.
2. `scripts/register-with-registry.ts` — the thin Node entrypoint that reads
   env and calls the lib.

…then swaps the `SHELL_*` env prefix (`IOS_BASE_URL`, `KIOSK_BASE_URL`, …) and
points at the same registry. The manifest stays empty.

## Event-driven nginx reload

The shell renders a dynamic `nginx.conf` from the live registry so the gateway
routes to exactly the pillars that are currently registered. The watcher CLI
(`pnpm --filter @pops/shell gen:nginx:watch`,
`scripts/watch-registry-and-reload-cli.ts`) is a long-lived process that
subscribes to `GET /registry/subscribe` and, on each `pillar.registered`,
`pillar.deregistered`, or `pillar.health-changed` frame, regenerates the conf,
runs `nginx -t` to validate it, and on pass executes the reload command. A
trailing 250ms debounce coalesces bursts (multi-pillar boot, eviction storms)
into a single regen + reload. The initial `pillar.snapshot` frame is ignored —
the dispatcher already reflects boot state.

If `nginx -t` rejects the new conf, the reload is skipped (the previous conf
stays live) and the optional health endpoint flips to `503` with
`nginx_generator_last_error_at` set until the next clean cycle.

Related scripts (all under `package.json`):

```bash
pnpm --filter @pops/shell gen:nginx          # one-shot static render
pnpm --filter @pops/shell gen:nginx:dynamic  # render from the live registry
pnpm --filter @pops/shell gen:nginx:check     # drift check (CI)
pnpm --filter @pops/shell gen:nginx:watch     # long-lived watch + reload
```

### Watcher env

| Var                          | Default                    | Purpose                                                                                                                      |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POPS_REGISTRY_URL`          | `http://registry-api:3001` | Registry pillar base URL; SSE consumed from `<url>/registry/subscribe`. `CORE_REGISTRY_URL` is a deprecated legacy fallback. |
| `POPS_NGINX_OUTPUT`          | shell `nginx.conf`         | Where the regenerated conf is written.                                                                                       |
| `POPS_NGINX_RELOAD_CMD`      | `nginx -s reload`          | Shell command run after each successful validate.                                                                            |
| `POPS_NGINX_CONFIG_TEST_CMD` | `nginx -t -c <output>`     | Pre-reload validation. Empty string disables the gate (e.g. nginx in another container).                                     |
| `POPS_NGINX_DEBOUNCE_MS`     | `250`                      | Trailing-debounce window for coalescing bursts.                                                                              |
| `POPS_NGINX_BACKOFF_MS`      | `1000`                     | Initial reconnect backoff (caps at 30s, doubles per failure).                                                                |
| `POPS_NGINX_HEALTH_PORT`     | (unset)                    | If set + positive, expose a JSON health endpoint with `nginx_generator_last_error_at`.                                       |
| `POPS_NGINX_HEALTH_HOST`     | `0.0.0.0`                  | Health endpoint bind host.                                                                                                   |
| `POPS_NGINX_HEALTH_PATH`     | `/health`                  | Health endpoint path.                                                                                                        |

### Health endpoint payload

```jsonc
{
  "status": "ok" | "degraded",
  "lastSuccessAt": 1718328000000 | null,
  "lastError": { "stage": "validate" | "regenerate" | "reload", "message": "...", "at": 1718327900000 } | null,
  "nginx_generator_last_error_at": 1718327900000 | null
}
```

`nginx_generator_last_error_at` is a unix-epoch-ms timestamp while the last
cycle failed, `null` while healthy. Returns `200` when `status` is `ok`, `503`
when `degraded`.

## Commands

```bash
pnpm --filter @pops/shell dev          # Vite dev server
pnpm --filter @pops/shell build        # tsc + vite build
pnpm --filter @pops/shell test         # vitest run
pnpm --filter @pops/shell test:e2e     # playwright test
pnpm --filter @pops/shell typecheck    # tsc --noEmit
```

`mise tasks` (from `pillars/shell/mise.toml`) wraps the same set plus `lint`
(`oxlint src && oxfmt --check .`, which has no `package.json` equivalent):
`mise run build | dev | typecheck | test | test:e2e | lint`.
