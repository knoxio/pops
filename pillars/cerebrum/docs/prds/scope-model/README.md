# Scope Model

> Status: Done — schema, rules engine, filtering, reclassify, reconciliation, and the REST surface are all live. The plain `engrams.create` REST path does not auto-inject the rule engine (it requires explicit scopes or a template default); rule-based auto-assignment runs only via the ingest pipeline. See [reserved-top-levels-and-create-path-auto-scope](../../ideas/reserved-top-levels-and-create-path-auto-scope.md) for the unbuilt remainder.

Hierarchical dot-notation scopes on engrams. Scopes are **output filtering**, not access control — there is one user; scopes make the system speak appropriately for context and hard-block secret content from shared outputs. Engrams, their scopes, plexus, glia, and conversations all live in the cerebrum pillar's own SQLite DB. See [ADR-020](../../architecture/adr-020-hierarchical-scope-model.md) for the format rationale.

## Data Model

### Scope format

A scope is a dot-separated hierarchical identifier (`work.projects.karbon`, `personal.secret.therapy`). Stored normalised (lowercased, trimmed) in the engram frontmatter `scopes` array and mirrored into the index.

| Property        | Rule                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| Segment charset | `^[a-z0-9][a-z0-9-]{0,31}$` — lowercase alphanumeric + hyphens, 1-32 chars   |
| Depth (stored)  | 2-6 segments inclusive                                                       |
| Secret marker   | Any segment named exactly `secret` (at any position) marks the engram secret |
| Reserved tops   | `personal` / `work` / `storage` are conventional, **not** enforced           |
| Normalisation   | Input is trimmed + lowercased before validation (`" Work.X "` → `work.x`)    |

Prefix inputs (filter, list, reclassify) are laxer: 1-6 segments, same charset — a single-segment prefix like `work` is allowed and matches the whole `work.*` subtree.

### `engram_scopes` table

Junction table in the cerebrum DB linking engrams to scopes.

| Column    | Type | Constraints                                        |
| --------- | ---- | -------------------------------------------------- |
| engram_id | TEXT | NOT NULL, FK → `engram_index.id` ON DELETE CASCADE |
| scope     | TEXT | NOT NULL                                           |

Unique `(engram_id, scope)`; index `idx_engram_scopes_scope` on `scope` powers prefix queries (`WHERE scope LIKE 'work.%'`) without table scans.

### Scope rules (`<engramRoot>/.config/scope-rules.toml`)

Pattern rules for automatic assignment, parsed with `smol-toml`:

```toml
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
assign = ["work.projects"]
priority = 10

[[rules]]
match = { source = "manual", tags = ["therapy"] }
assign = ["personal.secret.therapy"]
priority = 30
```

`match` conditions (`source`, `type`, `tags` — all present conditions must hold; tags use set-containment), `assign` (validated against the scope schema at load), `priority` (sort order, default 0).

## REST API (`cerebrum.scopes.*`)

| Method | Path                               | Purpose                                                                 |
| ------ | ---------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/engrams/:engramId/scopes`        | Add scopes (merged with existing); validates format; returns the engram |
| POST   | `/engrams/:engramId/scopes/remove` | Remove scopes; rejects removing the last one                            |
| POST   | `/scopes/reclassify`               | Bulk prefix-rename across all matching engrams; atomic; `dryRun` flag   |
| GET    | `/scopes`                          | List distinct scopes with engram counts, optional `prefix` filter       |
| POST   | `/scopes/validate`                 | Validate one scope string → `{ valid, scope? , errors? }`               |
| POST   | `/scopes/reconcile`                | Map user-typed scopes to canonical vocabulary suggestions               |
| POST   | `/scopes/filter`                   | Return engrams matching scope prefixes; secret-blocked unless opted in  |

Array inputs ride in POST bodies; `remove` is a POST sub-action (a DELETE can't carry a scope-array body cleanly). Non-identity domain — docker-net trust, no per-request auth.

## Business rules

- Every engram has **at least one scope** at all times. `remove` rejects the operation that would leave zero scopes.
- **Secret hard-block**: an engram with any `*secret*`-segment scope is excluded from every filter/output unless the caller passes `includeSecret: true`. Most-restrictive-wins — a secret scope alongside non-secret scopes still makes the engram secret. There is no implicit path to secret content.
- Scope strings are case-insensitive on input, stored lowercase.
- Rule resolution (`resolveScopes`, pure): (1) explicit scopes win as-is; (2) else all matching rules contribute additively (deduped); (3) else `defaults.fallback_scope`.
- Rule-based auto-assignment runs in the **ingest pipeline** (which instantiates `ScopeRuleEngine`). The plain `engrams.create` REST path does not inject the engine — it requires explicit scopes or a template that supplies `default_scopes`.
- A missing or malformed `scope-rules.toml`, an invalid `fallback_scope`, or an invalid rule `assign` does not crash anything — it logs a warning and falls back (`personal.captures` / skip the rule).
- `reclassify` is atomic: all engram file writes happen first (temp-file + rename), then the DB transaction; any failure rolls back the file writes (restoring original contents) and the transaction.
- Reconciliation (`/scopes/reconcile`) is pure lexical/structural matching against the known vocabulary — no LLM. Confidence tiers: same-segments-different-order 0.95, subset-of-longer-canonical 0.85, single-segment typo (Levenshtein ≤ 2) 0.80, shorter-more-used canonical 0.70; nothing below 0.6 is proposed, and exact-canonical inputs produce no suggestion.

## Edge cases

| Case                                               | Behaviour                                                  |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Trailing / consecutive dots (`work.x.`, `work..x`) | Validation rejects                                         |
| Uppercase input                                    | Normalised to lowercase, not rejected                      |
| Single-segment **stored** scope                    | Rejected (min depth 2); single-segment **prefix** is fine  |
| Depth > 6                                          | Rejected                                                   |
| Removing the last scope                            | Rejected with error                                        |
| Reclassify `fromScope` matches zero engrams        | `{ count: 0, ids: [] }`, no error                          |
| Empty filter `scopes` array                        | Returns all non-secret engrams (secret block still active) |
| Engram in `work.projects` **and** `work.secret.x`  | Excluded from a `work` filter unless `includeSecret`       |
| Prefix `work` (no wildcard)                        | Matches the whole `work.*` subtree                         |

## Frontend

`ScopePicker` (autocomplete from known scopes + manual entry, client-side `isValidScope` mirrors the server rules for per-keystroke feedback without a roundtrip) and `ScopeSuggestionList` ("Did you mean: …?" accept/dismiss affordances over `/scopes/reconcile`).

## Acceptance criteria

- [x] `work.projects.karbon` validates; `Work..Projects.`, single-segment, >6-deep, and >32-char-segment scopes are rejected (`scopeStringSchema` + `validateScope`).
- [x] `parseScope` yields `{ raw, segments, depth, topLevel, isSecret }`; `matchesPrefix("work.projects.karbon","work")` and `…"work.projects"` are both true; `isSecretScope("personal.secret.therapy")` is true, `…"personal.journal")` false.
- [x] `normaliseScope(" Work.Projects ")` → `"work.projects"`.
- [x] `resolveScopes` returns explicit scopes as-is; otherwise applies all matching rules additively; otherwise the configured fallback. Missing/malformed TOML or invalid config values degrade gracefully to `personal.captures` with a logged warning.
- [x] `filterByScopes` prefix-matches via the `scope` index and hard-blocks any secret-scoped engram unless `includeSecret: true`; empty `scopes` returns all non-secret engrams.
- [x] `inferScopesFromContext("at work")` → `["work"]`, `"personal"` → `["personal"]`.
- [x] `POST /engrams/:id/scopes` merges + validates; `POST …/scopes/remove` rejects emptying the set; both update frontmatter and the `engram_scopes` index.
- [x] `POST /scopes/reclassify` prefix-renames across all matching engrams atomically (file + DB), rolls back on any write failure, and supports `dryRun` returning `{ count, ids }` without mutating.
- [x] `GET /scopes` returns distinct scopes with per-scope engram counts, optionally prefix-filtered.
- [x] `POST /scopes/validate` returns `{ valid: true, scope }` or `{ valid: false, errors }`.
- [x] `POST /scopes/reconcile` maps typed scopes to canonical suggestions with confidence + reason; exact-canonical inputs and sub-0.6 candidates yield none.
- [x] `POST /scopes/filter` returns engrams matching the prefixes, secret-blocked unless opted in.
- [x] `engram_scopes` enforces a unique `(engram_id, scope)` pair, cascades on engram delete, and indexes `scope`.
