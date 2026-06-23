# Epic: Cross-language interop

> Theme: [Federation](../README.md)

## Scope

The wire-level specification and reference materials that let a pillar written in Rust, Go, Python, or any other language drop into POPS as a peer of TypeScript pillars. [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) commits to a per-pillar OpenAPI snapshot as the canonical schema-level contract surface, but OpenAPI does not fully describe the REST wire conventions around it — the value-direct success / error envelope, the HTTP status mapping, the registry handshake, the discovery snapshot and SSE stream, or the health probe. This epic documents that wire format precisely enough that a non-TS engineer can build a compliant pillar from the document alone.

"Done" looks like: a Rust / Go / Python engineer reads one document, implements the required HTTP surface, self-registers with the `registry` pillar (`:3001`) on boot, and TS consumers reach them via `pillar('rust-thing').something.list(...)` with no consumer-side awareness of the implementation language — exactly what the shipped Rust `contacts` pillar (`:3010`) already does.

## PRDs

| PRD                                                                                  | Summary                                                                                                                                           | Status |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Cross-language wire-format spec](../prds/cross-language-wire-format-spec/README.md) | Normative REST wire contract a non-TS pillar implements to federate: envelope, status mapping, manifest, registry handshake, discovery, health    | Done   |
| [External pillar example (Rust)](../prds/external-pillar-example-repo/README.md)     | The `contacts` pillar (axum + sqlx + utoipa) — a production Rust pillar that implements the wire-format spec and proves it from scratch in non-TS | Done   |

The shipped spec describes the REST wire the fleet already speaks and the Rust `contacts` pillar already implements. A drafted black-box conformance harness was never built — see [cross-language wire-format extensions](../../../ideas/cross-language-wire-format-extensions.md).

## Dependencies

- **Requires:** [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) (commits to OpenAPI as the cross-language contract; this epic specifies the wire-level shape ADR-033 references); the contract-package scaffold (the manifest and OpenAPI snapshot this epic specs are part of the per-pillar contract package); the pillar SDK (the reference TS implementation the spec must agree with); the registry protocol (the register / heartbeat / snapshot / subscribe endpoint shapes the spec documents at the wire level).
- **Unlocks:** the external Rust pillar example, any future non-TS pillar, and external-repo TS consumers that prefer the OpenAPI surface over npm contract packages.

## Out of Scope

- Per-language SDK implementations (Rust crate, Go module, Python package). [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) explicitly rejects POPS-owned per-language ports. Anyone wanting an idiomatic SDK builds it themselves on top of the spec.
- Authoring or maintaining OpenAPI codegen tooling for any language. The ecosystem already has mature generators; the spec points at them.
- Service-mesh features (mTLS between pillars, request signing, OAuth token exchange). The docker network is the trust boundary per [ADR-027](../../../architecture/adr-027-runtime-pillar-registry.md).
- Multi-instance pillar registration / load balancing. Single-instance per pillar id is the operating assumption.
- Sample non-TS pillars beyond a single reference (Rust). The reference impl is the external-pillar-example PRD's deliverable, not this epic's.
- Cross-host federation between POPS deployments. Single-host is the platform assumption.
