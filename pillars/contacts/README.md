# contacts

The **contacts** pillar — the authoritative entities store (CRM-lite): the
people/companies/places (merchants, payees, banks, brands, …) that every other
pillar references by id or name. It is the only **Rust** pillar in the fleet — a
standalone [axum](https://github.com/tokio-rs/axum) HTTP service that owns its
own SQLite DB (`contacts.db`), serves an OpenAPI 3.0.3 contract, and
self-registers with the `registry` pillar on boot. Default port **3010** (the
slot after `ai` 3008 and `orchestrator` 3009; override with `CONTACTS_PORT` /
`PORT`).

Domain docs: [`docs/README.md`](docs/README.md).

## Contract surface

contacts has no ts-rest/zod contract because it is not TypeScript. Its wire
contract is an OpenAPI 3.0.3 document built from `utoipa` annotations on the
route handlers (`src/openapi.rs`) and committed at
[`openapi/contacts.openapi.json`](openapi/contacts.openapi.json). The same
document is served live at `GET /openapi`, generated from the one source the
server and the `emit-openapi` bin share.

The HTTP surface:

| Path               | What it serves                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `/`                | Stub root — a plain-text identity banner so `GET /` is not a 404.                                   |
| `/entities`        | Contact CRUD + paginated/filtered list (`GET`/`POST`).                                              |
| `/entities/{id}`   | Single-entity read/update/delete (`GET`/`PATCH`/`DELETE`).                                          |
| `/entities/lookup` | Bulk match-column lookup (`POST`) — resolve many names/ids in one call.                             |
| `/search`          | The contacts slice of unified search (`POST`) — ranked name hits.                                   |
| `/health`          | Fleet-standard liveness envelope.                                                                   |
| `/openapi`         | The OpenAPI document, regenerated live from the same `src/openapi.rs` source as the committed copy. |

Registration is outbound: on boot (when opted in) contacts POSTs its manifest to
the registry, then heartbeats every 10s and deregisters on `SIGTERM`/`SIGINT`.

## OpenAPI emit and cross-language consumption

The committed JSON is generated, never hand-authored. The `emit-openapi` binary
writes `openapi/contacts.openapi.json` from `src/openapi.rs`; CI runs it and
`git diff --exit-code`s the result, so the document can never drift from the
code — the Rust mirror of the TS pillars' `generate-openapi.ts` drift gate.

Because contacts is Rust and ships no npm package, consumers cannot depend on a
`@pops/*` contract package. Per
[ADR-033](../../docs/architecture/adr-033-cross-language-pillar-contracts.md) the
OpenAPI snapshot **is** the cross-language contract: a consumer vendors a copy of
`contacts.openapi.json` and generates a typed client against it. `app-finance`
does exactly this — its vendored copy lives at
`pillars/finance/app/contracts/contacts.openapi.json`, kept in lockstep with the
canonical file by a repo-level drift gate
(`scripts/ci/check-vendored-contracts.mjs`).

## Layout

```
pillars/contacts/
├── Cargo.toml              crate `contacts` (lib + `contacts`/`emit-openapi` bins)
├── Dockerfile              builds and runs the `contacts` binary
├── mise.toml               per-pillar cargo tasks
├── docs/                   domain docs (PRDs, ideas) — see docs/README.md
├── migrations/             embedded SQLite migration journal (applied on boot)
├── openapi/                committed OpenAPI 3.0.3 contract
├── src/
│   ├── main.rs             server entry point (axum serve + graceful shutdown)
│   ├── bin/emit_openapi.rs the `emit-openapi` drift-gate generator
│   ├── config.rs           env-resolved Config (DEFAULT_PORT = 3010)
│   ├── app.rs              router assembly + AppState
│   ├── db.rs               pool connect + migrate
│   ├── openapi.rs          utoipa-built OpenAPI document (single source)
│   ├── manifest.rs         the pillar manifest registered with the registry
│   ├── registry/           register/heartbeat/deregister lifecycle + transport
│   ├── entities/           entities model, repo, and routes
│   ├── search/             contacts search slice
│   ├── health.rs           /health envelope
│   └── time.rs             timestamp helpers
└── tests/                  integration tests (entities, health, openapi, registry)
```

## Build, test, run

contacts uses `mise` for per-pillar tasks (defined in `mise.toml`), all of which
wrap `cargo` against the repo-root cargo workspace:

```sh
# From pillars/contacts/
mise run build       # cargo build --all-targets
mise run test        # cargo test  (unit + tests/)
mise run lint        # cargo clippy -D warnings && cargo fmt --check
mise run typecheck   # cargo check --all-targets
mise run dev         # cargo watch -x run

# Or call cargo directly:
cargo run                                  # boot the server on :3010
cargo test                                 # run all tests
cargo run --bin emit-openapi               # regenerate openapi/contacts.openapi.json
```

The binary boots with zero env in local/dev: the port defaults to `3010`, the
SQLite file to `contacts.db` (created on first boot via `?mode=rwc`), and the
schema is applied from the embedded migration journal. In-cluster overrides
(`CONTACTS_SQLITE_PATH=/data/sqlite/contacts.db`, `BUILD_VERSION`, …) arrive via
the contacts service definition in `infra/docker-compose.yml`.

## Self-registration

Registry self-registration is **opt-in** via `POPS_REGISTRY_ENABLED=true` (off in
local/test so a run never reaches out to a registry). When enabled, the lifecycle
registers with backoff, heartbeats every 10s, and deregisters best-effort on
shutdown — the reference Rust implementation of the same handshake the TS pillars
run through `@pops/pillar-sdk`. The registry origin resolves
`POPS_REGISTRY_URL` → `CORE_URL` → `http://registry-api:3001`; the base URL the
registry records for contacts resolves `CONTACTS_SELF_BASE_URL` →
`http://localhost:<port>`. A missing or broken registry never blocks boot:
registration retries in the background while the server serves its surface.
