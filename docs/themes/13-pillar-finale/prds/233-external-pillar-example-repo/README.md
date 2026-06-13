# PRD-233: External pillar example (Rust reference)

> Epic: [Cross-language interop](../../epics/14-cross-language-interop.md)

> Status: In progress — proof-of-concept scaffolded

> Spec: [`pillar-wire-format-v1.md`](../../specs/pillar-wire-format-v1.md)

## Overview

A minimal Rust pillar that implements the [wire-format spec v1](../../specs/pillar-wire-format-v1.md) end-to-end. It exists to prove the spec is implementable from scratch in a non-TS language, validate the registration endpoint shipped in PRD-228, and serve as the canonical worked example for future Go / Python / Swift pillars. It is **not a deployment target** — it never runs in the home-lab docker-compose. Its only job is to pass `@pops/wire-conformance` end-to-end.

If `@pops/pillar-sdk` and this implementation disagree, the [spec](../../specs/pillar-wire-format-v1.md) is the tie-breaker — not either implementation.

## Source layout

```
examples/pops-pillar-rust-example/
├── Cargo.toml
├── Dockerfile
├── README.md
└── src/
    └── main.rs
```

Out-of-tree from `pnpm-workspace.yaml`. No crate-level publishing.

## API Surface

The example implements the subset of v1 needed to demonstrate end-to-end correctness:

| Endpoint                             | Purpose                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `GET  /manifest.json`                | `ManifestPayload` for pillar id `example-rust`, empty capability arrays. |
| `GET  /health`                       | `{ ok, status, pillar, version, ts }` healthy / unhealthy per §7.        |
| `POST /trpc/examplerust.hello.greet` | Reference success procedure — returns `{ greeting: "hello from rust" }`. |

On boot, the pillar POSTs `core.registry.register` per §6 using `POPS_INTERNAL_API_KEY`. Full-jitter exponential backoff up to 5 minutes per §6.5.

## Business Rules

- The manifest returned by `GET /manifest.json` MUST match the body sent at registration time.
- Pillar id is `example-rust` (kebab); procedure namespace is `examplerust` (no hyphens, per the `PROCEDURE_PATH` regex in `@pops/pillar-sdk/manifest-schema`).
- The example does NOT need to implement every `WF-*` assertion — subscriptions, batching, error-envelope edge cases are out of scope for the proof-of-concept. The README documents which assertions are covered.
- No persistence, no DB, no config files. Env vars only.

## Acceptance Criteria

- [x] `cargo build --release` succeeds against the pinned `axum` toolchain.
- [x] `GET /manifest.json` returns a body that parses with `@pops/pillar-sdk/manifest-schema` `ManifestPayloadSchema`.
- [x] `GET /health` returns `200 { ok: true, status: "healthy", pillar: "example-rust", ... }`.
- [x] `POST /trpc/examplerust.hello.greet` with `{ "input": null }` returns `{ result: { data: { greeting: "hello from rust" } } }`.
- [x] On boot, POSTs `core.registry.register` with `X-Internal-API-Key` and retries with backoff on transient failure.
- [x] README documents how to run `@pops/wire-conformance` against the running container.
- [ ] `WF-13-manifest-shape`, `WF-14-manifest-cache-control`, `WF-17-health-healthy`, `WF-01-single-call-success` pass when run from `@pops/wire-conformance` (covered subset).

## Out of Scope

- Subscriptions (`WF-08`…`WF-12`).
- Batched call shape (`WF-04`…`WF-07`).
- Production deployment, CI image publication, watchtower auto-rollout.
- A second non-TS language (Go / Python). Defer until this one is stable.
- Search adapter / AI tool / sink contributions. The example declares empty capabilities.
