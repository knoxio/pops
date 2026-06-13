# pops-shell

Vite/React web UI for pops.

## UI-pillar registration (ADR-035 + PRD-228)

ADR-035 carves pillars into three variants — `data`, `UI`, and `bridge`.
The shell is the first **UI pillar**: it owns no data, exposes no
procedures, and ships an empty manifest (no `routes.queries`, no
`search.adapters`, no `ai.tools`, no `uri.types`, no `settings.keys`,
no `sinks`). It still announces itself to `pops-core-api`'s pillar
registry so the federation has a single, dynamic list of every running
surface — UI included.

PRD-228 US-01 ships the `POST /core.registry.register` endpoint. The
shell calls it via a Node CLI rather than the browser bundle because:

- the shared `POPS_INTERNAL_API_KEY` (ADR-027 docker-network trust
  boundary) must not reach the client bundle;
- the production image is `nginx:alpine` and has no Node at request
  time, so registration happens at deploy time, not request time.

### Wire shape

```jsonc
POST /core.registry.register
{
  "pillarId": "shell",
  "baseUrl":  "https://pops.local",
  "manifest": {
    "pillar":      "shell",
    "version":     "0.1.0",
    "contract":    { "package": "@pops/shell-contract", "version": "0.1.0", "tag": "contract-shell@v0.1.0" },
    "routes":      { "queries": [], "mutations": [], "subscriptions": [] },
    "search":      { "adapters": [] },
    "ai":          { "tools": [] },
    "uri":         { "types": [] },
    "settings":    { "keys": [] },
    "healthcheck": { "path": "/health" }
  },
  "apiKey": "<POPS_INTERNAL_API_KEY>"
}
```

### Invoking the CLI

```bash
POPS_REGISTRY_URL=http://core-api:3001 \
SHELL_BASE_URL=https://pops.local \
POPS_INTERNAL_API_KEY=… \
  tsx apps/pops-shell/scripts/register-with-registry.ts
```

Behaviour:

- **All env vars present** → `POST` to the registry, prints
  `{ kind: 'registered', pillarId, registeredAt }` on success.
- **Any env var missing** → silent skip (same `INVENTORY_BASE_URL`
  discipline as the data pillars). The script prints
  `{ kind: 'skipped', reason: 'missing-env', missing: [...] }` and
  exits 0 so a partially-configured deploy still boots.
- **Registry unreachable** → logs a warning, prints
  `{ kind: 'unreachable', error }`, and exits 0. Registration is
  best-effort — a UI pillar that fails to announce itself is degraded,
  not broken.
- **Registry returns non-2xx** → prints `{ kind: 'failed', status, body }`
  with the structured error payload (e.g. `{ ok: false, reason:
'invalid-api-key' }`).

### Reusing this pattern for iOS / kiosk / future UI surfaces

Each new UI surface that needs to appear in the federated registry
copies this directory's three pieces:

1. `src/lib/register-with-registry.ts` — the pure registration function
   with deps-injected transport + logger.
2. `scripts/register-with-registry.ts` — the thin Node entrypoint that
   reads env and calls the lib.
3. This README section.

…then swaps the `SHELL_PILLAR_ID` / `SHELL_BASE_URL` env var prefix
(`IOS_BASE_URL`, `KIOSK_BASE_URL`, …) and points at the same
`/core.registry.register` endpoint. The manifest stays empty: the
contract sentinel (`@pops/<id>-contract@v0.1.0`) is the only
per-surface change.

## Event-driven nginx reload (PRD-228 US-03)

`pnpm gen:nginx:watch` runs `scripts/watch-registry-and-reload-cli.ts`
— a long-lived process that subscribes to `GET /registry/subscribe`
(PRD-163) and, on each `pillar.registered`, `pillar.deregistered`, or
`pillar.health-changed` frame, regenerates `nginx.conf` from the live
registry (`pnpm gen:nginx:dynamic` logic), runs `nginx -t` to validate
the rendered conf, and on pass executes the reload command. A
trailing 250ms debounce coalesces bursts (multi-pillar boot,
eviction-storms) into a single regen + reload. The initial
`pillar.snapshot` frame is intentionally ignored — the dispatcher
already reflects boot state.

If `nginx -t` rejects the new conf, the reload is skipped (the
previous conf stays live) and the optional health endpoint flips to
503 with `nginx_generator_last_error_at` set until the next clean
cycle.

### Env

| Var                          | Default                      | Purpose                                                                                                |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CORE_REGISTRY_URL`          | `http://core-api:3001`       | Core-api base URL; SSE consumed from `<url>/registry/subscribe`.                                       |
| `POPS_NGINX_OUTPUT`          | `apps/pops-shell/nginx.conf` | Where the regenerated conf is written.                                                                 |
| `POPS_NGINX_RELOAD_CMD`      | `nginx -s reload`            | Shell command run after each successful validate.                                                      |
| `POPS_NGINX_CONFIG_TEST_CMD` | `nginx -t -c <output>`       | Pre-reload validation. Empty string disables the gate (e.g. when nginx runs in a different container). |
| `POPS_NGINX_DEBOUNCE_MS`     | `250`                        | Trailing-debounce window for coalescing bursts.                                                        |
| `POPS_NGINX_BACKOFF_MS`      | `1000`                       | Initial reconnect backoff (caps at 30s, doubles per failure).                                          |
| `POPS_NGINX_HEALTH_PORT`     | (unset)                      | If set + positive, expose a JSON health endpoint with `nginx_generator_last_error_at`.                 |
| `POPS_NGINX_HEALTH_HOST`     | `0.0.0.0`                    | Health endpoint bind host.                                                                             |
| `POPS_NGINX_HEALTH_PATH`     | `/health`                    | Health endpoint path.                                                                                  |

### Health endpoint payload

```jsonc
{
  "status": "ok" | "degraded",
  "lastSuccessAt": 1718328000000 | null,
  "lastError": { "stage": "validate" | "regenerate" | "reload", "message": "...", "at": 1718327900000 } | null,
  "nginx_generator_last_error_at": 1718327900000 | null
}
```

`nginx_generator_last_error_at` is a unix-epoch-ms timestamp while the
last cycle failed, `null` while healthy. Returns 200 when `status` is
`ok`, 503 when `degraded`.

### Deploy shape (follow-up)

Two viable shapes — implementation choice is **deferred** to a
follow-up so this PR can ship the watcher + tests in isolation:

1. **Sidecar inside the nginx container.** Watcher writes
   `/etc/nginx/conf.d/default.conf` and runs `nginx -s reload`
   directly. Lowest latency, same container so `nginx` is on PATH.
2. **Standalone Node container on the docker network.** Watcher
   writes a shared volume mounted into nginx and triggers reload via
   `POPS_NGINX_RELOAD_CMD="docker kill -s HUP pops-nginx"` (needs the
   docker socket mounted into the watcher).

Both shapes share the same script; only the env varies. Wiring into
`docker-compose.yml` / `Dockerfile` is the follow-up PR's scope.
