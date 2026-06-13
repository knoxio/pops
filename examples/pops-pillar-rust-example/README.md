# pops-pillar-rust-example

Reference [POPS wire-format v1](../../docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md)
pillar written in Rust. Built directly against the spec — never against the
`@pops/pillar-sdk` source — to prove the spec is implementable from scratch
in a non-TypeScript language.

This crate is **not a deployment target**. It is a worked example used to
validate the spec and the conformance suite (`@pops/wire-conformance`).

PRD: [`docs/themes/13-pillar-finale/prds/233-external-pillar-example-repo/`](../../docs/themes/13-pillar-finale/prds/233-external-pillar-example-repo/README.md).

## What it implements

| Endpoint                             | Spec section | Notes                                                                            |
| ------------------------------------ | ------------ | -------------------------------------------------------------------------------- |
| `GET /manifest.json`                 | §5           | Returns a valid `ManifestPayload` for pillar `example-rust`, empty capabilities. |
| `GET /health`                        | §7           | Healthy by default; pass `?simulate=unhealthy` to get a `503` for `WF-18`.       |
| `POST /trpc/examplerust.hello.greet` | §3           | Returns `{ result: { data: { greeting: "hello from rust" } } }`.                 |
| Boot-time registration               | §6           | POSTs `core.registry.register` with full-jitter backoff, 5-minute deadline.      |

Each response echoes `X-Request-Id` (spec §9.2) and rejects `X-Pops-Wire-Version`
values outside `[1]` with `METHOD_NOT_SUPPORTED` and a `supportedVersions` array
(spec §9.1).

## Why Rust, why these crates

- **`axum 0.7`** — most idiomatic minimal HTTP framework in the Rust ecosystem
  with first-class `tokio` integration. `warp` was the alternative; `axum`
  wins on ergonomics for a routing-heavy service.
- **`reqwest`** — boot-time registration client. `rustls-tls` keeps the runtime
  image free of OpenSSL.
- **`serde_json::Value`** — the manifest is a tree of JSON, not a Rust struct.
  Treating it as `Value` keeps the example tiny and matches what an external
  language SDK would do.

## Build

```bash
cd examples/pops-pillar-rust-example
cargo build --release
```

Or with Docker:

```bash
docker build -t pops-pillar-rust-example:dev .
```

## Run

```bash
PORT=3010 \
POPS_PILLAR_BASE_URL=http://localhost:3010 \
POPS_CORE_BASE_URL=http://core-api:3000 \
POPS_INTERNAL_API_KEY=$(grep POPS_INTERNAL_API_KEY ../../apps/pops-api/.env | cut -d= -f2-) \
cargo run --release
```

`POPS_CORE_BASE_URL` is **optional**. When unset the pillar starts but skips
registration — useful when running the conformance harness against a
standalone fixture pillar (no `core-api` in scope).

## Verify with `@pops/wire-conformance`

In a second terminal, with the pillar running on `:3010`:

```bash
# From the repo root:
pnpm --filter @pops/wire-conformance build
node -e '
  import("./packages/wire-conformance/dist/index.js").then(async (m) => {
    const report = await m.runConformance({
      baseUrl: "http://localhost:3010",
      coreBaseUrl: process.env.POPS_CORE_BASE_URL ?? "http://localhost:3010",
      apiKey: process.env.POPS_INTERNAL_API_KEY ?? "dev-key",
      probes: {
        successProcedure: "examplerust.hello.greet",
        notFoundProcedure: "examplerust.hello.greet",
        subscriptionProcedure: "examplerust.hello.greet",
        idleSubscriptionProcedure: "examplerust.hello.greet",
        errorSubscriptionProcedure: "examplerust.hello.greet",
        registrationPillarId: "example-rust",
      },
    });
    console.log(JSON.stringify(report, null, 2));
  });
'
```

### Assertions covered by this scaffold

This proof-of-concept implements the **happy path** subset only. Expect these
to pass:

- `WF-01-single-call-success` — `examplerust.hello.greet` returns a valid
  envelope.
- `WF-13-manifest-shape` — manifest parses against `ManifestPayloadSchema`.
- `WF-14-manifest-cache-control` — manifest sends `Cache-Control: no-store`.
- `WF-17-health-healthy` — `/health` returns the spec-shaped healthy payload.
- `WF-18-health-unhealthy` — `/health?simulate=unhealthy` returns `503` with
  `ok: false`.
- `WF-19-request-id-echo` — every response echoes inbound `X-Request-Id`.
- `WF-20-wire-version-unsupported` — `X-Pops-Wire-Version: 999` returns
  `METHOD_NOT_SUPPORTED` with `supportedVersions`.
- `WF-15-registration-success` — only when run against a real `core-api`
  with a valid `POPS_INTERNAL_API_KEY`.

### Explicitly NOT covered

Subscriptions (`WF-08`…`WF-12`), batched calls (`WF-04`…`WF-07`), and the
error-envelope edge cases (`WF-02`, `WF-03`, `WF-16`) are deliberately out of
scope for this scaffold. They are tracked under the PRD's "Out of Scope"
section and are the obvious next iteration if a real non-TS pillar is ever
needed.

## Layout

```
src/main.rs    single-file implementation; ~250 lines
Cargo.toml     dependency manifest
Dockerfile     multi-stage build → distroless-ish debian-slim runtime
```

If this grows beyond a single file, split routes into a `handlers/` module
before reaching for crates.
