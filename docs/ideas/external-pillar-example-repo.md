# External pillar example — unbuilt pieces

The cross-language story is discharged by a real, deployed Rust pillar (`contacts` —
see [the PRD](../themes/federation/prds/external-pillar-example-repo/README.md)). These
adjacent deliverables were specced but never built, and the chosen approach made the
first two unnecessary.

## Standalone throwaway example repo

The original plan was a minimal `examples/pops-pillar-rust-example/` crate — out of the
workspace glob, never deployed, empty capability arrays, whose only job was to pass a
conformance suite end-to-end. It does not exist (`examples/` is absent).

Superseded: instead of a second non-production binary that only proves the spec is
implementable, the platform shipped the proof as a real pillar (`contacts`, the
authoritative entities store). Every cross-language claim is now backed by a deployed,
image-published, litestream-replicated service rather than a sample. A throwaway example
would now be strictly less convincing than the production one.

Revisit only if an external contributor wants a from-scratch starter template that is
deliberately tiny (single route, no DB) to copy when standing up a brand-new non-TS
pillar — i.e. a _teaching_ artefact, not a _proof_ artefact.

## Black-box wire-conformance harness

A `wire-conformance` package was specced as a language-agnostic CLI
(`wire-conformance --base-url http://pillar:3010 --manifest ./manifest.json`) running a
battery of black-box HTTP probes (manifest shape, health shape, single-call success,
batched response order, SSE framing) and exiting non-zero on any failure. It was never
built — there is no `packages/wire-conformance/` and no equivalent.

What replaced it, in practice:

- the registry's live `validateManifestPayload` rejects a non-conforming manifest at
  register time (a non-retriable `400`);
- the Rust OpenAPI contract tests (`pillars/contacts/tests/openapi_contract.rs`) pin the
  3.0.x version, the dotted operationId set, and the hidden internal columns;
- the Rust registry integration tests (`tests/registry.rs`) exercise the register /
  heartbeat / deregister / re-register / backoff / path-fallback paths against an
  in-process fake;
- the entities + health integration tests pin the REST envelopes.

Much of the original suite was also written against the **dead tRPC wire shape** (the
`/trpc/<router>.<proc>` URL, the `{ result: { data } }` envelope, the batched
`{ "0": …, "1": … }` body, the `/core.registry.register` path, SSE subscriptions). The
current REST architecture has no batched endpoint and no `/trpc/` mount on a
cross-language pillar, so those assertions describe a surface that no longer exists.

Worth building if/when a third-party pillar author wants a single self-service green/red
gate to run before submitting a pillar — but it must be authored against the REST
contract (OpenAPI snapshot + manifest schema + registry envelopes), not the retired tRPC
envelope.

## A second non-TS language

One reference (Rust) proves the cross-language surface is implementable outside
TypeScript. A Go / Python / Swift port would prove portability across _more_ runtimes but
adds nothing the Rust pillar has not already established about the wire contract. Deferred
until a concrete pillar genuinely wants one of those languages.

## Native settings + AI from a Rust pillar

The reference declares empty `settings.manifests` / `ai.tools` (readiness only). A Rust
pillar serving a real settings panel needs the shared `pops-settings` crate; a Rust pillar
making Claude calls needs the `pops-ai` crate. Both crates exist in the workspace but the
contacts pillar wires neither in v1. Folding either in is follow-up work on the reference,
not a new example.
