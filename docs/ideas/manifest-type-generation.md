# Idea: richer manifest type generation

Spun out of the [manifest-type-generation](../themes/federation/prds/manifest-type-generation.md) PRD (federation theme). The
shipped codegen is deliberately small: a hand-maintained string renderer emits a
four-member `<Pillar>Contract` interface (`pillar`, `version`, `entities`,
`errors`, `router`), normalised by `oxfmt` and drift-checked. The original PRD
sketched a much larger surface that was never built. Captured here for if/when
the typed manifest needs to do more.

## Not built

### TS Compiler API extraction

Replace the hand-written renderer with a `ts.createProgram` walk of the
contract's source tree. The generator would discover exported symbols
automatically (handling renames, aliases, re-exports, barrels) rather than
naming them in the renderer. Benefits: adding an entity means only adding the
file + barrel export, with zero renderer edits. Costs: heavier dependency,
slower runs (the PRD floated caching the parsed program between runs and a <1s
target). Today's renderer is faster and simpler but couples the codegen to a
hardcoded symbol list.

### Wider `<Pillar>Contract` surface

The PRD wanted the interface to additionally carry:

- `schemas` — `typeof <Entity>Schema` for every Zod schema export.
- `search` — `readonly [...]` of declared search adapter names.
- `ai` — `readonly [...]` of declared AI tool names.
- `uri` — `readonly [...]` of declared URI types.
- `settings` — `readonly [...]` of declared settings keys.

Today these dimensions live only on the **runtime** `ManifestPayload`
(`ManifestPayloadSchema` in the SDK), not on the compile-time interface. Pulling
them into the typed contract would let consumers reference, e.g.,
`FinanceContract['search']['adapters']` at compile time.

### Generated `<Pillar>ManifestPayload` type + generic `buildManifestPayload()`

The PRD proposed generating a per-pillar `ManifestPayload` **type** and a
hand-written generic `buildManifestPayload({ routes })` helper that assembles the
value from `as const` arrays. Reality: the wire type is a single shared
`ManifestPayload` (Zod-inferred, SDK-owned), and each pillar writes its own
`build<Pillar>Manifest(version)` constructor. A per-pillar generated payload type
would only be worth it if the payload shape diverged per pillar, which it does
not.

### `as const` author-maintenance model

The PRD's ergonomic goal: the only manual edit to add a search adapter / AI tool
/ URI type / settings key is appending a string to an `export const X = [...] as
const` array in `search.ts` / `ai.ts` / `uri.ts` / `settings.ts`, with codegen
deriving everything else. Those files and arrays do not exist today; those
dimensions are populated directly in each pillar's `build<Pillar>Manifest`
literal. Worth revisiting if hand-maintaining the payload literals becomes error
prone.

### Literal `version` type

The PRD wanted `version: '1.4.2'` (literal) so the registry's compatibility check
is type-checkable at the call site. Today the interface uses `version: string`
with the concrete value only pinned in a header comment. A literal would require
the codegen to inline the `package.json` version into the type, regenerating on
every version bump.

## Why deferred

The shipped pipeline already delivers the load-bearing value: a single committed,
drift-checked entry point per pillar plus a Zod-validated wire payload. The extra
surface is speculative until a concrete consumer needs compile-time access to
search/ai/uri/settings or per-pillar payload types. Build it when that consumer
shows up, not before.
