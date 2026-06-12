# PRD-157: Manifest schema + Zod validator

> Epic: [Pillar SDK](../../epics/01-pillar-sdk.md)

## Overview

The canonical Zod schema that describes the wire shape of a pillar's manifest payload, plus a validator with per-field error reporting. Lives in `@pops/pillar-sdk/manifest-schema`. Used by both the pillar (before POSTing to the registry on boot) and the registry (before accepting a registration). Belt-and-braces: a bug at either end is caught at the closest possible point.

PRD-155's `<Pillar>ManifestPayload` type is structurally `z.infer<typeof ManifestPayloadSchema>` narrowed by the pillar's literal id; this PRD defines the source-of-truth schema that derivation depends on.

## Data Model

### `@pops/pillar-sdk/manifest-schema`

```ts
import { z } from 'zod';

// Constants for shared validation patterns
const PILLAR_ID = z.string().regex(/^[a-z][a-z0-9-]*$/, 'pillar id must be lowercase kebab-case');
const SEMVER = z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, 'must be semver');
const PROCEDURE_PATH = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/,
    'must match <pillar>.<router>.<procedure>'
  );

export const ManifestPayloadSchema = z
  .object({
    pillar: PILLAR_ID,
    version: SEMVER,

    contract: z.object({
      package: z.string().regex(/^@pops\/[a-z-]+-contract$/, 'must be @pops/<pillar>-contract'),
      version: SEMVER,
      tag: z
        .string()
        .regex(
          /^contract-[a-z-]+@v\d+\.\d+\.\d+(-[a-z0-9.]+)?$/,
          'must be contract-<pillar>@v<semver>'
        ),
    }),

    routes: z.object({
      queries: z.array(PROCEDURE_PATH),
      mutations: z.array(PROCEDURE_PATH),
      subscriptions: z.array(PROCEDURE_PATH).default([]),
    }),

    search: z.object({
      adapters: z.array(z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'must be camelCase identifier')),
    }),

    ai: z.object({
      tools: z.array(
        z.object({
          name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
          description: z.string().min(10).max(500),
          parameters: z.record(z.unknown()), // free-form JSON Schema; deep validation deferred
        })
      ),
    }),

    uri: z.object({
      types: z.array(
        z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/, 'must be <pillar>/<entity>')
      ),
    }),

    settings: z.object({
      keys: z.array(
        z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/, 'must be dotted.lower.camel')
      ),
    }),

    healthcheck: z.object({
      path: z.string().regex(/^\//, 'must start with /'),
    }),
  })
  .strict();

export type ManifestPayload = z.infer<typeof ManifestPayloadSchema>;
```

### Validator function

```ts
// @pops/pillar-sdk/manifest-schema/validate.ts

export type ValidationIssue = {
  field: string; // dotted path: 'routes.queries[3]'
  reason: string; // human-readable: 'must match <pillar>.<router>.<procedure>'
  got: unknown; // the offending value
  schemaPath: readonly (string | number)[]; // Zod's raw issue path (for tooling)
};

export type ValidationResult =
  | { ok: true; payload: ManifestPayload }
  | { ok: false; issues: ValidationIssue[] };

export function validateManifestPayload(input: unknown): ValidationResult;
```

Internally: `ManifestPayloadSchema.safeParse(input)`, then on failure map each `ZodIssue` to the `ValidationIssue` shape — converting `path: ['routes', 'queries', 3]` into the dotted string `'routes.queries[3]'`, attaching the issue's `message` as `reason`, and walking back into `input` via the path to capture `got`.

### Cross-field consistency rules

Beyond Zod's per-field validation, two cross-field invariants are enforced via a follow-on check:

1. **Contract package matches pillar.** `contract.package` MUST be `@pops/<payload.pillar>-contract`. Reported as `field: 'contract.package', reason: 'must match pillar id: expected @pops/finance-contract, got @pops/media-contract'`.
2. **Contract tag matches contract version.** `contract.tag` MUST be `contract-<payload.pillar>@v<payload.contract.version>`. Reported analogously.

These run after Zod's parse succeeds (so the structural shape is already known).

## API Surface

### Exports

```ts
// @pops/pillar-sdk/manifest-schema/index.ts
export { ManifestPayloadSchema, type ManifestPayload } from './schema';

export { validateManifestPayload, type ValidationResult, type ValidationIssue } from './validate';
```

### Used by

- **Pillar SDK boot** (PRD-158): `buildManifestPayload()` returns a payload; `validateManifestPayload()` is called before POSTing to the registry. Failure crashes the boot loudly with the per-field report.
- **Registry endpoint** (PRD-161): `POST /core.registry.register` deserialises the body, calls `validateManifestPayload`, returns a 400 with the issues array on failure.
- **CLI tooling** for contract authors: a `pnpm validate:manifest <pillar>` command that runs the validator against the contract's `buildManifestPayload()` output. Catches issues at PR time, not deploy time.

## Business Rules

- **The schema is `.strict()`** — unknown fields fail validation. The wire format is closed; future expansion requires a semver-disciplined schema change.
- **Per-field error reporting is non-negotiable.** A single "manifest invalid" rejection makes 3am debugging horrible. Every issue has `field`, `reason`, `got`, and the underlying Zod path.
- **Both ends validate.** Pillar fails boot → it's a bug in the pillar's code. Registry rejects → either the pillar shipped without re-running the validator OR the registry's schema is out of date (caught by the registry's CI tests).
- **The Zod schema is hand-written and version-controlled.** No codegen. Reviewers see the wire format changes in PRs. Tightening a regex or adding a required field is a coordinated change between the SDK + every registered pillar — handle as a coordinated rollout.
- **Schema changes follow the SDK's semver.** The SDK package's semver bumps when the schema changes. Pillars pin an SDK version; the registry pins a (potentially older or newer) version. Compatibility window: at least one minor version of SDK skew accepted at the registry.
- **`ai.tools[].parameters` is intentionally loose** — accepts any JSON-Schema-shaped object. Deep validation of tool parameters is an AI-orchestrator concern (Epic 07), not the manifest schema's. Keeps this PRD bounded.
- **Cross-field rules are explicit, not buried in `.refine()`.** They live in `validate.ts` after the Zod parse, with named functions per invariant. Easier to test; easier to read.
- **Validator returns a discriminated union, never throws.** `{ ok: true } | { ok: false }`. Callers handle both branches. No try/catch ceremony.
- **The validator is pure.** No side effects, no logging. Callers decide what to do with the result (boot crash, HTTP 400, etc.).

## Edge Cases

| Case                                                                                              | Behaviour                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload has an unknown top-level field                                                            | `.strict()` rejects. Issue: `{ field: '<fieldname>', reason: 'unknown field' }`.                                                              |
| Payload has unknown nested field (e.g. `routes.unknownThing`)                                     | `.strict()` is opt-in; nested objects need their own `.strict()`. The schema applies it consistently.                                         |
| Procedure path doesn't match the regex                                                            | Per-field issue: `{ field: 'routes.queries[2]', reason: 'must match <pillar>.<router>.<procedure>', got: 'finance.transactions' }`.           |
| `contract.package` doesn't match `pillar` (e.g. pillar='finance', package='@pops/media-contract') | Caught by cross-field rule, NOT by Zod itself. Issue reported as cross-field invariant violation.                                             |
| AI tool `description` is shorter than 10 chars                                                    | Issue: `{ field: 'ai.tools[0].description', reason: 'must be at least 10 characters', got: 'foo' }`.                                          |
| Empty arrays (zero search adapters, zero AI tools, etc.)                                          | Valid. A pillar that exposes no AI tools is fine; it just won't appear in AI orchestration.                                                   |
| Payload is `null` or non-object                                                                   | Zod top-level error: `{ field: '', reason: 'expected object, got null' }`.                                                                    |
| Duplicate procedure paths in `routes.queries`                                                     | Currently allowed by the schema. A separate cross-field rule could catch it; deferred — duplicates are functionally harmless (just wasteful). |
| Same pillar registers with different contract versions in two heartbeats                          | Out of this PRD's scope; reconciliation lives in PRD-164 (Epic 02).                                                                           |
| Validator called with a payload that has extra fields the SDK added (forward-compat)              | Rejected by `.strict()`. Means SDK + registry must agree on the schema. Acceptable; the SDK is the schema author.                             |
| Zod path includes a number for array index                                                        | Converted to `[N]` in the dotted field string for human readability. `['routes', 'queries', 3]` → `'routes.queries[3]'`.                      |
| Cross-field rule needs to report multiple issues                                                  | All checked; all reported in one pass. Issues are NOT short-circuited at the first failure.                                                   |

## User Stories

| #   | Story                                                           | Summary                                                                                                             | Parallelisable                               |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 01  | [us-01-zod-schema](us-01-zod-schema.md)                         | Define `ManifestPayloadSchema` with all per-field validators + `.strict()` discipline                               | yes — independent                            |
| 02  | [us-02-cross-field-rules](us-02-cross-field-rules.md)           | The two cross-field invariants (contract.package matches pillar, tag matches version)                               | blocked by us-01                             |
| 03  | [us-03-validator-function](us-03-validator-function.md)         | `validateManifestPayload()` — Zod safeParse + path mapping + cross-field rules                                      | blocked by us-01 + us-02                     |
| 04  | [us-04-error-formatting](us-04-error-formatting.md)             | Convert Zod's raw path arrays into dotted-string field names; attach `got` value                                    | blocked by us-03                             |
| 05  | [us-05-validator-tests](us-05-validator-tests.md)               | Every constraint covered by a negative test: each regex, each cross-field rule, `.strict()` rejection, etc.         | blocked by us-03                             |
| 06  | [us-06-cli-validate-manifest](us-06-cli-validate-manifest.md)   | `pnpm validate:manifest <pillar>` — runs validator against the contract's emitted payload; for PR-time checks       | blocked by us-03                             |
| 07  | [us-07-pillar-sdk-integration](us-07-pillar-sdk-integration.md) | Bootstrap helper (PRD-158) calls validate before POSTing; boot crashes with per-field report on failure             | blocked by us-03 + Epic 02's registry client |
| 08  | [us-08-registry-integration](us-08-registry-integration.md)     | Registry's `POST /register` handler uses the same validator; returns 400 + issues array on failure                  | blocked by us-03 + PRD-161                   |
| 09  | [us-09-schema-evolution-docs](us-09-schema-evolution-docs.md)   | Document how to evolve the schema — semver discipline, coordinated SDK + registry bumps, compatibility-window rules | yes — can be written in parallel             |

## Out of Scope

- Per-tool parameter schema validation. `ai.tools[].parameters` is a JSON-Schema-shaped blob accepted as-is; deep validation is Epic 07's concern.
- Schema versioning beyond SDK semver. The manifest schema's version IS the SDK's version. No separate `manifestSchemaVersion` field.
- Custom validation per pillar (e.g. "finance must declare at least one search adapter"). Pillar-specific invariants live in the pillar's own code, not the shared schema.
- Forward-compat schema evolution via additive fields with defaults. Deferred until we see real evolution pressure — `.strict()` for now.
- Schema diff tooling for SDK version bumps. The schema is small; PR review catches changes. Revisit if schema growth makes this painful.
- Validator-driven OpenAPI generation. The schema describes the wire format; OpenAPI for the _registry endpoint_ uses it, but not for individual pillar contracts (those live in PRD-153 / 219).
- A `safeParse`-style escape hatch for partial validation. Either it validates or it doesn't.
- Performance optimisation (memoising the Zod schema across calls). The schema is constructed once at module-load; calls are cheap.
