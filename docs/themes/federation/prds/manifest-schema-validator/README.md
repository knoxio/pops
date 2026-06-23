# Manifest Schema + Validator

> Theme: [Federation](../../README.md)
> Status: Done

## Overview

The canonical Zod schema that describes the wire shape of a pillar's manifest
payload, plus a validator with per-field error reporting. Lives in
`@pops/pillar-sdk/manifest-schema` (`libs/sdk/src/manifest-schema`). Every pillar
declares a manifest; the SDK validates it before the pillar self-registers, and
the `registry` pillar re-validates it before accepting a registration. Belt-and-
braces: a bug at either end is caught at the closest possible point.

The manifest is the federation's contract surface. A pillar pushes it in its
register envelope; the registry persists it and re-serves it in the discovery
snapshot; the orchestrator reads search adapters and AI tools out of it; the
shell reads `nav` / `pages` / `captureOverlay` / `settings` / `features` out of
it. The schema is the single point where the wire format of all of that is
pinned and enforced.

The schema is hand-written and version-controlled — no codegen. Reviewers see
wire-format changes in PRs. The TypeScript `ManifestPayload` type is
`z.infer<typeof ManifestPayloadSchema>`; a per-pillar `build<Pillar>Manifest()`
returns a value of that type and each pillar's own test suite asserts the value
passes both `ManifestPayloadSchema.parse` and the full cross-field
`validateManifestPayload`.

## Data model

### The schema — `ManifestPayloadSchema`

A `.strict()` object. Unknown keys — at the top level and in every nested object
— fail validation. The wire format is closed; expansion is a deliberate,
reviewed schema change.

| Field              | Shape                                         | Required | Notes                                                         |
| ------------------ | --------------------------------------------- | -------- | ------------------------------------------------------------- |
| `pillar`           | kebab-case id                                 | yes      | `^[a-z][a-z0-9-]*$`                                           |
| `version`          | semver                                        | yes      | `^\d+\.\d+\.\d+(-[a-z0-9.]+)?$`                               |
| `contract`         | `{ package, version, tag }`                   | yes      | strict object — see below                                     |
| `routes`           | `{ queries, mutations, subscriptions }`       | yes      | each entry a procedure path; `subscriptions` defaults to `[]` |
| `search`           | `{ adapters: SearchAdapter[] }`               | yes      | adapters carry `queryShape` + `procedurePath`                 |
| `ai`               | `{ tools: AiTool[] }`                         | yes      | tools may declare `allowedUriTypes` / `requiredScopes`        |
| `sinks`            | `{ descriptors: SinkDescriptor[] }`           | no       | event sinks the pillar subscribes to (ADR-034)                |
| `uri`              | `{ types: string[] }`                         | yes      | each `<pillar>/<entity>`                                      |
| `consumedSettings` | `{ keys: string[] }`                          | yes      | dotted lower-camel setting keys this pillar reads             |
| `settings`         | `{ manifests: SettingsManifestDescriptor[] }` | no       | settings-UI contributions (ADR-037)                           |
| `nav`              | `NavConfigDescriptor`                         | no       | app-rail entry the shell renders                              |
| `pages`            | `PageDescriptor[]`                            | no       | routable pages the shell mounts                               |
| `assetsBaseUrl`    | absolute URL                                  | no       | reserved for external-pillar UI loading                       |
| `captureOverlay`   | `CaptureOverlayDescriptor`                    | no       | global capture-overlay contribution                           |
| `features`         | `FeatureDescriptor[]`                         | no       | serializable projection of `FeatureDefinition`                |
| `healthcheck`      | `{ path }`                                    | yes      | path must start with `/`                                      |

### Shared validators

| Constant           | Regex / rule                                                                                        | Used by                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PILLAR_ID`        | `^[a-z][a-z0-9-]*$`                                                                                 | `pillar`, `features[].capability.pillar`                                                        |
| `SEMVER`           | `^\d+\.\d+\.\d+(-[a-z0-9.]+)?$`                                                                     | `version`, `contract.version`                                                                   |
| `PROCEDURE_PATH`   | `^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$` (`<pillar>.<router>.<procedure>`)          | `routes.*`, `search.adapters[].procedurePath`                                                   |
| `CAMEL_IDENTIFIER` | `^[a-z][a-zA-Z0-9]*$`                                                                               | `ai.tools[].name`, `search.adapters[].name`, `rankFieldName`, `supportsScope[]`                 |
| `KEBAB_IDENTIFIER` | `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`                                                                     | `search.adapters[].entityType`, nav/page/overlay slots + icons                                  |
| `URI_TYPE`         | `^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$` (`<pillar>/<entity>`)                                          | `uri.types`, `ai.tools[].allowedUriTypes`                                                       |
| `SETTINGS_KEY`     | `^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$` (dotted lower-camel)                                         | `consumedSettings.keys`, `ai.tools[].requiredScopes`, feature keys                              |
| `CONTRACT_PACKAGE` | `^@pops\/(?:[a-z-]+-contract\|[a-z-]+)$`                                                            | `contract.package` — accepts legacy `@pops/<pillar>-contract` **or** collapsed `@pops/<pillar>` |
| `CONTRACT_TAG`     | `^contract-[a-z-]+@v\d+\.\d+\.\d+(-[a-z0-9.]+)?$`                                                   | `contract.tag`                                                                                  |
| `SINK_EVENT_TYPE`  | `^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$` (`<source>.<entity>.<action>`, lowercase dotted) | `sinks.descriptors[].eventType` (ADR-034)                                                       |

Identifier conventions (pillar id + tool name + sink event type) are specified in
[ADR-036](../../../../architecture/adr-036-pillar-id-tool-name-conventions.md).

### Search adapter

```
{
  name: CAMEL_IDENTIFIER,
  entityType: KEBAB_IDENTIFIER,
  queryShape: {
    supportsText: boolean,
    supportsTags: boolean,
    supportsDateRange: boolean,
    supportsScope: CAMEL_IDENTIFIER[],
  },
  procedurePath: PROCEDURE_PATH,
  rankFieldName?: CAMEL_IDENTIFIER,
}
```

`queryShape` is strict — all four fields required, no extras. The orchestrator
reads `queryShape` to know which filters a federated query may push to this
adapter.

### AI tool

```
{
  name: CAMEL_IDENTIFIER,
  description: string (10..500),
  parameters: Record<string, unknown>,   // free-form JSON Schema; deep validation deferred
  allowedUriTypes?: URI_TYPE[],
  requiredScopes?: SETTINGS_KEY[],
}
```

`parameters` is intentionally loose — any JSON-Schema-shaped object passes.
Deep validation of tool parameters is an orchestrator concern, not the manifest
schema's. The tool-router composes the qualified call name `<pillarId>.<name>` at
call time, which is why `name` is a bare camelCase identifier (ADR-036).

### Sink descriptor (ADR-034)

```
{ eventType: SINK_EVENT_TYPE, description: string (10..500), schema: Record<string, unknown> }
```

The flat `<source>.<entity>.<action>` namespace is shared across the whole
federation; validating it at manifest time stops two pillars from claiming the
same event type with diverging payloads.

### Feature descriptor

Serializable projection of `FeatureDefinition` (`@pops/types`). Carries only the
declarative fields a pillar can put on the wire — the runtime
`capabilityCheck()` function is **dropped** in favour of a declarative
`capability: { pillar, key }` descriptor (the live up/down status is resolved
later from that pillar's heartbeat snapshot, never carried in the static
manifest). Strict mode rejects a `capabilityCheck` function leaking onto the wire.

```
{
  key: SETTINGS_KEY,
  label: string (min 1),
  description?: string,
  default: boolean,
  scope: 'system' | 'user' | 'capability',
  requires?: SETTINGS_KEY[],
  requiresEnv?: string[],
  settingKey?: SETTINGS_KEY,
  configureLink?: string (starts with /),
  capability?: { pillar: PILLAR_ID, key: CAMEL_IDENTIFIER },
  preview?: boolean,
  deprecated?: boolean,
}
```

### Settings / nav / pages / capture-overlay descriptors

The wire validators for the shell-facing dimensions. The TypeScript shapes in
`@pops/types` remain the source of truth; these Zod objects are the wire
validators that confirm an inbound manifest carries well-formed UI
contributions. Settings is specified by
[ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md).
`nav.order` / `captureOverlay.order` drive app-rail and overlay ordering
(ties broken lexicographically by pillar id, shell-side); icons travel the wire
as kebab-case identifiers and resolve to components at the shell.

## Validator

### `validateManifestPayload(input: unknown): ValidationResult`

A pure function — no side effects, no logging, never throws. Callers decide what
to do with the result (boot crash, HTTP 400). Returns a discriminated union:

```
type ValidationResult =
  | { ok: true;  payload: ManifestPayload }
  | { ok: false; issues: ValidationIssue[] }

type ValidationIssue = {
  field: string;                              // dotted path: 'routes.queries[3]'
  reason: string;                             // human-readable
  got: unknown;                               // the offending value, walked back out of `input`
  schemaPath: readonly (string | number)[];   // Zod's raw issue path, for tooling
}
```

Flow:

1. `ManifestPayloadSchema.safeParse(input)`.
2. On failure, `flatMap` each `ZodIssue` to one-or-more `ValidationIssue`s
   (a single `unrecognized_keys` issue expands to one issue per unknown key) and
   return `{ ok: false }`. Cross-field rules do **not** run — structural shape is
   not yet known.
3. On success, run the four cross-field rules; if any fire, return their issues.
4. Otherwise `{ ok: true, payload }`.

### Error formatting

`pathToDotted` converts Zod's raw path array to a human-readable string:
`['routes', 'queries', 3]` → `'routes.queries[3]'`; array indices render as
`[N]`, object keys join with `.`, a leading index has no leading dot
(`[0].name`). `got` is captured by walking the original `input` along the path,
so the report shows the exact value the author wrote.

### Cross-field rules

All four run in one pass; none short-circuit; all violations are reported
together. Each is an exported pure function returning `ValidationIssue[]`.

| Rule                                      | Invariant                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkContractPackageMatchesPillar`       | `contract.package` equals `@pops/<pillar>-contract` (legacy) **or** `@pops/<pillar>` (collapsed). Mismatch reports the expected forms and the value seen.                |
| `checkContractTagMatchesVersion`          | `contract.tag` equals `contract-<pillar>@v<contract.version>`.                                                                                                           |
| `checkSearchAdapterProceduresAreDeclared` | every `search.adapters[].procedurePath` appears in `routes.queries` **or** `routes.mutations` (a search adapter cannot fan out to a procedure the pillar doesn't serve). |
| `checkAiToolAllowedUriTypesAreDeclared`   | every `ai.tools[].allowedUriTypes` entry appears in `uri.types` (a tool cannot reference a URI type the pillar doesn't expose).                                          |

The cross-field rules live in `validate.ts` after the parse, as named functions
— not buried in `.refine()`. Easier to test in isolation, easier to read; each
is exported.

## Consumers

| Consumer                      | Where                                                                                                                          | Behaviour                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pillar boot**               | `bootstrapPillar` (`libs/sdk/src/bootstrap/bootstrap.ts`)                                                                      | Validates before POSTing to the registry. On failure throws `PillarManifestInvalidError` (carries `issues`), crashing boot loudly with the per-field report.                                                             |
| **Registry register**         | `POST /registry/register` + legacy alias `POST /core.registry.register` (`pillars/registry/.../external-registry/register.ts`) | Deserialises the body, validates, returns `400 { ok: false, issues }` on failure. On success, also rejects a `manifest.pillar` ≠ `pillarId` mismatch before persisting.                                                  |
| **Per-pillar manifest tests** | `pillars/<id>/src/api/__tests__/manifest.test.ts`                                                                              | Each pillar's `build<Pillar>Manifest()` output is asserted to pass `ManifestPayloadSchema.parse` and `validateManifestPayload`. This is the PR-time guard: a malformed manifest fails the pillar's own CI before deploy. |

The register route is mounted on **both** the canonical slash path
(`POST /registry/register`) and the legacy dotted alias
(`POST /core.registry.register`), pointing at the same handler, so an old-SDK
pillar keeps registering during rollout.

### Build-version coercion

Watchtower-driven deploys inject the git SHA as `BUILD_VERSION`, which is not
semver. Rather than crash boot, `bootstrapPillar` coerces a non-semver
`manifest.version` into `0.0.0-sha.<7chars>` (a valid semver prerelease) **before**
validating — and rewrites `contract.version` + `contract.tag` to match so the
cross-field tag rule still passes. Already-semver values pass through unchanged.

## Rules

- **The schema is `.strict()`, top-level and nested.** Unknown fields fail.
  Expansion is a coordinated, reviewed schema change.
- **Per-field error reporting is non-negotiable.** Every issue carries `field`,
  `reason`, `got`, and `schemaPath`. A single "manifest invalid" rejection makes
  3am debugging miserable.
- **Both ends validate.** Pillar fails boot → bug in the pillar's manifest
  builder. Registry rejects → either the pillar shipped without re-running the
  validator or the registry's schema is out of date (caught by the registry's
  own tests).
- **The validator never throws.** Discriminated union; callers handle both
  branches. No try/catch ceremony.
- **The validator is pure.** No side effects, no logging. The caller owns the
  consequence.
- **Cross-field rules are explicit, not `.refine()` magic.** Named, exported,
  individually testable functions running after the parse.
- **`ai.tools[].parameters` is intentionally loose.** Any JSON-Schema-shaped
  object passes. Deep validation is the orchestrator's concern.
- **The schema is hand-written and version-controlled.** No codegen. Tightening a
  regex or adding a required field is a coordinated rollout across the SDK and
  every registered pillar; PR review is the change-control mechanism.
- **Schema version is the SDK's version.** No separate `manifestSchemaVersion`
  field. The SDK package's semver bumps when the schema changes; pillars and the
  registry pin SDK versions; the legacy dotted register alias absorbs SDK skew.

## Edge cases

| Case                                                                                                                   | Behaviour                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Unknown top-level field                                                                                                | `.strict()` rejects. One issue per unknown key: `{ field: '<key>', reason: 'unknown field', got, schemaPath }`. |
| Unknown nested field (`routes.unknownThing`)                                                                           | Same — every nested object is `.strict()`. Issue field is the full dotted path.                                 |
| Procedure path fails the regex                                                                                         | `{ field: 'routes.queries[2]', reason: 'must match <pillar>.<router>.<procedure>', got }`.                      |
| `contract.package` doesn't match `pillar`                                                                              | Cross-field rule (not Zod). Reports both accepted forms and the value seen.                                     |
| `contract.tag` doesn't match `contract.version`                                                                        | Cross-field rule. `expected contract-<pillar>@v<version>`.                                                      |
| Search adapter `procedurePath` not in routes                                                                           | Cross-field rule: `procedurePath '…' is not declared in routes.queries or routes.mutations`.                    |
| AI tool `allowedUriTypes` entry not in `uri.types`                                                                     | Cross-field rule: `allowedUriTypes entry '…' is not declared in uri.types`.                                     |
| AI tool `description` shorter than 10 / longer than 500                                                                | Zod issue at `ai.tools[N].description`. Boundaries (exactly 10 / 500) are accepted.                             |
| Empty arrays (zero search adapters, zero AI tools, empty `features`)                                                   | Valid. A pillar that exposes no AI tools simply won't appear in AI orchestration.                               |
| `null` / non-object input                                                                                              | Top-level Zod error: `{ field: '', got: null }`. Numbers, strings, booleans, arrays all rejected.               |
| `routes.subscriptions` omitted                                                                                         | Defaults to `[]`.                                                                                               |
| Optional dimensions (`sinks` / `settings` / `nav` / `pages` / `captureOverlay` / `features` / `assetsBaseUrl`) omitted | All backwards-compatible — a manifest with none of them is valid.                                               |
| `FeatureDescriptor.capabilityCheck` function on the wire                                                               | Rejected by `.strict()` — only the declarative `capability` descriptor is allowed.                              |
| `version` is a git SHA (`BUILD_VERSION`)                                                                               | Boot coerces to `0.0.0-sha.<7chars>` and rewrites `contract.{version,tag}` before validating; passes.           |
| Multiple violations in one payload                                                                                     | All collected, none short-circuited — both Zod errors and cross-field rules report every issue in one pass.     |
| Cross-field rules when the Zod parse already failed                                                                    | Not run. Structural shape is unknown, so contract/adapter/tool invariants can't be evaluated yet.               |
| Duplicate procedure paths in `routes.queries`                                                                          | Allowed — functionally harmless (just wasteful). No rule catches it.                                            |

## Acceptance criteria

- [x] `ManifestPayloadSchema` is a `.strict()` Zod object with every field
      validated by the shared regex constants; nested objects are strict too.
- [x] All wire dimensions are modelled: `pillar`, `version`, `contract`, `routes`,
      `search`, `ai`, `sinks`, `uri`, `consumedSettings`, `settings`, `nav`, `pages`,
      `assetsBaseUrl`, `captureOverlay`, `features`, `healthcheck`.
- [x] `contract.package` accepts both the legacy `@pops/<pillar>-contract` and the
      collapsed `@pops/<pillar>` package forms.
- [x] `routes.subscriptions` defaults to `[]` when omitted.
- [x] Optional dimensions (`sinks`, `settings`, `nav`, `pages`, `assetsBaseUrl`,
      `captureOverlay`, `features`) are backwards-compatible — a manifest without them
      validates.
- [x] `FeatureDescriptor` drops the runtime `capabilityCheck` in favour of a
      declarative `capability: { pillar, key }`; a `capabilityCheck` on the wire is
      rejected by strict mode.
- [x] `validateManifestPayload` returns a discriminated union and never throws.
- [x] Each `ValidationIssue` carries `field` (dotted), `reason`, `got` (walked out
      of `input`), and `schemaPath` (raw Zod path).
- [x] `pathToDotted` renders array indices as `[N]` and joins object keys with `.`,
      with no leading dot before a leading index.
- [x] `unrecognized_keys` expands to one issue per unknown key, each `reason:
'unknown field'`.
- [x] Cross-field rule: `contract.package` matches the pillar id.
- [x] Cross-field rule: `contract.tag` matches `contract-<pillar>@v<version>`.
- [x] Cross-field rule: every search adapter `procedurePath` is declared in
      `routes.queries` or `routes.mutations`.
- [x] Cross-field rule: every AI tool `allowedUriTypes` entry is declared in
      `uri.types`.
- [x] Cross-field rules run only after a successful parse, collect all violations,
      and never short-circuit.
- [x] Each cross-field checker is an exported pure function returning
      `ValidationIssue[]`.
- [x] `bootstrapPillar` validates the manifest before registering and throws
      `PillarManifestInvalidError` (carrying `issues`) on failure.
- [x] `bootstrapPillar` coerces a non-semver `BUILD_VERSION` into a valid semver
      prerelease and rewrites `contract.{version,tag}` before validating.
- [x] The registry register handler validates the inbound manifest and returns
      `400 { ok: false, issues }` on failure, and rejects a `manifest.pillar` ≠
      `pillarId` mismatch.
- [x] `@pops/pillar-sdk/manifest-schema` exports `ManifestPayloadSchema`,
      `ManifestPayload`, `validateManifestPayload`, `ValidationResult`,
      `ValidationIssue`, `pathToDotted`, and the four cross-field checkers.
- [x] Every pillar's `build<Pillar>Manifest()` output passes both
      `ManifestPayloadSchema.parse` and `validateManifestPayload` in that pillar's
      own test suite.
- [x] The schema + validator suite is green (214 tests across `schema.test.ts` and
      `validate.test.ts`).

## Out of scope

- Per-tool parameter schema validation. `ai.tools[].parameters` is accepted as-is;
  deep JSON-Schema validation is the orchestrator's concern.
- A separate `manifestSchemaVersion` field. The manifest schema's version is the
  SDK's version.
- Pillar-specific invariants ("finance must declare a search adapter"). Those live
  in the pillar's own code/tests, not the shared schema.
- Forward-compatible additive evolution with defaults. `.strict()` for now; revisit
  under real evolution pressure.
- Schema-diff tooling for SDK version bumps. The schema is small; PR review catches
  changes.
- Validator-driven OpenAPI generation. The registry endpoint's OpenAPI uses the
  schema; individual pillar contracts generate their own.
- A standalone `validate:manifest <pillar>` CLI. The per-pillar manifest test
  suites already gate this at PR time. The standalone CLI and the schema-evolution
  runbook are tracked separately — see
  [docs/ideas/manifest-schema-validator.md](../../../../ideas/manifest-schema-validator.md).
- Reconciliation of divergent contract versions across heartbeats — a registry-
  lifecycle concern, not the validator's.
