# Epic 14: Cross-language interop

> Theme: [Pillar finale](../README.md)

## Scope

The wire-level specification, conformance harness, and reference materials that let a pillar written in Rust, Go, Python, or any other language drop into POPS as a peer of TypeScript pillars. [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) commits to OpenAPI snapshots as the canonical cross-language contract surface, but OpenAPI does not fully describe the POPS tRPC-shaped wire envelope, batched-call format, subscription stream, manifest endpoint convention, or registration handshake. This epic documents that wire format precisely enough that a non-TS engineer can build a compliant pillar from the doc alone, then provides a conformance suite the pillar runs against itself to prove compliance.

"Done" looks like: a Rust/Go/Python engineer reads one document, implements the required HTTP surface, points the conformance suite at their pillar, gets green, registers with the runtime registry, and TS consumers reach them via `pillar('rust-thing').something.list(...)` with no consumer-side awareness of the implementation language.

## PRDs

| #   | PRD                                                                                          | Summary                                                                                                                                | Status      |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 231 | [Cross-language SDK wire-format spec](../prds/231-cross-language-wire-format-spec/README.md) | Single-page wire-format spec covering envelope, batching, subscription, manifest, registration, health + a black-box conformance suite | Done        |
| 233 | [External pillar example (Rust)](../prds/233-external-pillar-example-repo/README.md)         | Minimal Rust reference pillar that implements the wire-format spec and proves it is implementable from scratch in a non-TS language    | In progress |

Parallelisation: PRD-231's user stories split into spec authoring (US-01), publication target (US-02), and the conformance harness (US-03). US-01 must land first; US-02 + US-03 can ship in parallel against the frozen spec. PRD-233 depends on US-01 being frozen.

## Dependencies

- **Requires:** [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) (commits to OpenAPI as cross-language contract; this epic specifies the wire-level shape ADR-033 references), Epic 00 (contract packages — the manifest and OpenAPI snapshot this epic specs are part of the contract package surface), Epic 01 (pillar SDK is the reference TS implementation that the spec must agree with), Epic 02 (registration endpoint shape lives in this spec; the runtime endpoint lives in Epic 02), Epic 04 (`splitLink` batching strategy informs the batched-call format the spec documents)
- **Unlocks:** PRD-233 (external Rust pillar example), any future non-TS pillar, external-repo TS consumers that prefer the OpenAPI surface over npm contract packages

## Out of Scope

- Per-language SDK implementations (Rust crate, Go module, Python package). [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) explicitly rejects POPS-owned per-language ports. Anyone wanting an idiomatic SDK builds it themselves on top of the spec.
- Authoring or maintaining OpenAPI codegen tooling for any language. The ecosystem already has mature generators; the spec points at them.
- Service-mesh features (mTLS between pillars, request signing, OAuth token exchange). The docker network is the trust boundary per ADR-027.
- Multi-instance pillar registration / load balancing. Single-instance per pillar id is the operating assumption across Theme 13.
- Sample non-TS pillars beyond a single reference (Rust). The reference impl is PRD-233's deliverable, not this epic's.
- Cross-host federation between POPS deployments. Single-host is the platform assumption.
