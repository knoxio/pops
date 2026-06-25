# AI tool manifest

> Theme: [Federation](../README.md)

## Overview

Every pillar declares the AI-callable tools it exposes in the `ai.tools` slot of
its manifest. Each descriptor carries a name, a human/LLM-readable description, a
JSON Schema for its parameters, and — optionally — the URI types it acts on and
the settings scopes it requires. The orchestrator (`pillars/orchestrator`, :3009)
projects these descriptors into a live tool list per request and routes
invocations back to the owning pillar. No tool is hand-registered anywhere
central: adding an AI tool is a manifest change on one pillar plus a redeploy of
that pillar only.

This PRD owns the **manifest contract** — the schema of a tool descriptor and the
validation that keeps it honest. Building the per-request tool list from the
registry snapshot and routing a call back to a pillar are separate concerns
covered by [Dynamic tool list](dynamic-tool-list.md) and
[Tool-call routing](tool-call-routing.md).

## Data model

The `ai` slot is a required, `.strict()` block on every manifest. It holds a
single `tools` array; the array may be empty (most pillars ship `ai: { tools: [] }`
until they expose AI surface).

```ts
ai: {
  tools: {
    name: string;                          // camelCase identifier — /^[a-z][a-zA-Z0-9]*$/
    description: string;                   // 10–500 chars
    parameters: Record<string, unknown>;   // JSON Schema for the tool's arguments
    allowedUriTypes?: string[];            // each "<pillar>/<entity>", subset of uri.types
    requiredScopes?: string[];             // each a dotted settings key, e.g. finance.write
  }[];
}
```

Defined as `AI_TOOL` in the manifest schema (`libs/sdk/src/manifest-schema/schema.ts`),
nested under the `AI` block of `ManifestPayloadSchema`. Every field that is not
listed is rejected — the descriptor object is `.strict()`.

The orchestrator-facing projection (`Tool` in `libs/sdk/src/ai-tools/types.ts`)
augments each descriptor with its owning `pillar` id and live `pillarStatus`;
that projection belongs to [Dynamic tool list](dynamic-tool-list.md).

### Field rules

| Field             | Rule                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `name`            | camelCase, no dots, no hyphens. The wire/LLM name is `<pillarId>.<name>`, composed at call time.  |
| `description`     | 10–500 characters. This is what the LLM reads to decide whether to call the tool.                 |
| `parameters`      | A JSON Schema object. Threaded verbatim to the provider's tool/function schema.                   |
| `allowedUriTypes` | Optional. Each entry is `<pillar>/<entity>` and **must** appear in the manifest's `uri.types`.    |
| `requiredScopes`  | Optional. Each entry is a dotted settings key (`finance.write`). Format-checked only (see below). |

## Naming convention

Tool names are **camelCase and pillar-scoped by composition, never by prefix**.
The descriptor stores the bare name (`categorize`, `entityList`); the tool-router
composes the qualified `<pillarId>.<name>` (`finance.categorize`,
`ha-bridge.entityList`) at call time and splits on the _first_ dot to recover the
two halves. Consequences, per [ADR-036](../../../architecture/adr-036-pillar-id-tool-name-conventions.md):

- The pillar id may contain hyphens; the tool name may not — a second dot would
  break the first-dot split in the router.
- Do **not** prefix the name with the pillar id inside the manifest. A descriptor
  named `financeCategorize` produces `finance.financeCategorize` on the wire.
- Provider tool schemas (Anthropic, OpenAI) treat the name as one identifier and
  behave poorly with dots/hyphens — camelCase is the driver, not an aesthetic.

## Validation

The shape is enforced by Zod (`AI_TOOL`) at manifest-validation time
(`validateManifestPayload`), which runs when a pillar self-registers with the
`registry` pillar. On top of the per-field checks, one cross-field rule applies:

**`checkAiToolAllowedUriTypesAreDeclared`** — every entry in a tool's
`allowedUriTypes` must be present in the manifest's top-level `uri.types`. A tool
cannot claim to act on a URI type the pillar does not expose. Violations surface
as a `ValidationIssue` at `ai.tools[<i>].allowedUriTypes[<j>]` and reject the
whole manifest at registration.

## Business rules

- **Tool descriptors are additive.** Adding a tool to a manifest is a minor,
  backwards-compatible change to the pillar's contract; removing one is breaking.
- **A tool only acts on URIs the pillar owns.** `allowedUriTypes ⊆ uri.types`,
  enforced cross-field. Omitting `allowedUriTypes` means the tool is not
  URI-scoped.
- **Names never collide across pillars** because the qualified wire name carries
  the pillar id. Within a pillar, two tools with the same `name` are an authoring
  bug the contract's own type-checking catches.
- **Tool implementation lives on the pillar.** The manifest declares the
  descriptor; the executable handler sits behind the pillar's REST surface and is
  invoked by [Tool-call routing](tool-call-routing.md).

## Edge cases

| Case                                                       | Behaviour                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tool name with a dot or hyphen                             | Rejected by `CAMEL_IDENTIFIER` at validation.                                              |
| `allowedUriTypes` references a URI type not in `uri.types` | Cross-field validator rejects the manifest with an `ai.tools[i].allowedUriTypes[j]` issue. |
| Empty `allowedUriTypes` array                              | Accepted — the tool declares no URI scoping.                                               |
| Unknown field on a descriptor (e.g. `sneaky: true`)        | Rejected — descriptor is `.strict()`.                                                      |
| `description` shorter than 10 or longer than 500 chars     | Rejected.                                                                                  |
| Pillar exposes no AI surface                               | `ai: { tools: [] }` — valid; the pillar simply contributes nothing to the tool list.       |

## Acceptance criteria

- [x] The manifest schema carries a required `ai` block with a `tools` array of
      `.strict()` descriptors (`name`, `description`, `parameters`,
      `allowedUriTypes?`, `requiredScopes?`).
- [x] `name` is validated as a camelCase identifier (no dots, no hyphens).
- [x] `description` is bounded to 10–500 characters.
- [x] `parameters` is validated as a JSON-Schema-shaped object record.
- [x] `allowedUriTypes` entries are validated as `<pillar>/<entity>` and an empty
      array is accepted.
- [x] `requiredScopes` entries are validated as dotted settings keys.
- [x] Cross-field validation rejects any `allowedUriTypes` entry not present in
      the manifest's `uri.types`.
- [x] An unknown field on a tool descriptor is rejected (strict mode).
- [x] The naming convention (camelCase descriptor name, `<pillarId>.<name>`
      composed at call time) is documented in [ADR-036](../../../architecture/adr-036-pillar-id-tool-name-conventions.md)
      and cross-referenced from the schema source.
- [ ] No pillar populates real tool descriptors yet — every shipped manifest
      carries `ai: { tools: [] }`. Populating pilots is tracked in
      [the populate-pillar-tools idea](../../../ideas/ai-tool-manifest.md).

## Out of scope

- Building the per-request tool list from the registry snapshot →
  [Dynamic tool list](dynamic-tool-list.md).
- Routing an invoked tool back to its pillar and handling unavailability →
  [Tool-call routing](tool-call-routing.md).
- Enforcing `requiredScopes` against a real service-account/scope grant — the
  field is format-checked only; there is no cross-field check that the scope
  exists or is held. Tracked in [the idea](../../../ideas/ai-tool-manifest.md).
- Tool implementation (handlers live on the pillar), tool versioning beyond
  contract semver, and cross-tool dependencies.
