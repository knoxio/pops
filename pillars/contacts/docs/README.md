# contacts

The entities directory. `contacts` is the authoritative store for entities — the
people/companies/places (merchants, payees, banks, brands, …) that every other
pillar references by id or name. It is the only Rust pillar in the fleet; every
other data pillar is TypeScript.

## What it is

- A standalone Rust / [axum](https://github.com/tokio-rs/axum) HTTP service.
- Owns its own SQLite database (`contacts.db`) — no shared database, no
  cross-pillar table access. The schema is applied from an embedded migration
  journal on boot.
- Serves an OpenAPI 3.0.3 contract emitted from `utoipa` annotations on the
  route handlers (`openapi/contacts.openapi.json`, also served live at
  `GET /openapi`). This is the contacts equivalent of a TS pillar's
  ts-rest + zod contract.
- Self-registers with the `registry` pillar on boot and heartbeats to stay a
  live member, exactly like the TS pillars do via `@pops/pillar-sdk`.

## Surface

The HTTP surface is three buildable units:

| Unit                                 | Path prefix | What it serves                                                                |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| [entities](prds/entities.md)         | `/entities` | Contact CRUD, paginated/filtered list, and the bulk match-column lookup.      |
| [search](prds/search.md)             | `/search`   | The contacts slice of unified search — ranked name hits for the orchestrator. |
| [registration](prds/registration.md) | (outbound)  | Boot register + heartbeat + deregister handshake with the `registry` pillar.  |

Plus the fleet-standard `GET /health` liveness envelope and `GET /openapi`.

## Wire compatibility

contacts is a drop-in for what was previously a TypeScript entities service, so
its wire shapes are byte-compatible with the rest of the fleet:

- The error envelope is `{ message, code? }` and pagination meta is
  `{ total, limit, offset, hasMore }` — identical to the shared TS shapes.
- Entity JSON is camelCase; `aliases` is a CSV column on disk but a `string[]`
  on the wire, and `defaultTags` is a JSON-array column but a `string[]` on the
  wire. Encoding matches the prior TS service byte-for-byte so a row round-trips
  unchanged.
- The integration columns `notionId`, `ownerUri`, `ownerUriStaleAt` exist on the
  table but are never projected onto the wire.

## Consumers

- `finance` reads the whole contact set through `pillar('contacts').entities.list`
  (paginated sweep) for its import matcher and entity-usage rollup. finance no
  longer owns an entities table — it only consumes this pillar.
- The `orchestrator` federates the `search` adapter declared in the manifest.
- Any pillar can resolve a `pops:contacts/contact/<id>` URI to this pillar.

## Runtime

- Listens on `:3010` by default (the slot after `ai` 3008 and `orchestrator`
  3009). Override with `CONTACTS_PORT` / `PORT`.
- SQLite path defaults to `contacts.db`; in-cluster it is
  `CONTACTS_SQLITE_PATH=/data/sqlite/contacts.db`.
- Registry self-registration is opt-in via `POPS_REGISTRY_ENABLED=true`
  (off in local/test). Registry origin resolves `POPS_REGISTRY_URL` →
  `CORE_URL` → `http://registry-api:3001`.

## Not built yet

The manifest declares a `contacts-list` page bundle slot, but the pillar ships
no frontend `app/` yet. The contacts management UI (entities table, CRUD
dialogs) is captured as an idea, not a requirement — see
[ideas/contacts-frontend.md](ideas/contacts-frontend.md).
