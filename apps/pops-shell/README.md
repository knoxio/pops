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
