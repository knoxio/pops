# PRD-078: Scope Model

> Epic: [00 — Engram Storage](../../epics/00-engram-storage.md)
> Status: Not started

## Overview

Define the hierarchical dot-notation scope system for engrams. Scopes control which content appears in outputs — they are not access control (there is one user) but output filtering so the system speaks appropriately for context. This PRD covers scope format validation, rule-based auto-assignment, query-time filtering with secret-scope protection, and the tRPC management API. See [ADR-020](../../../architecture/adr-020-hierarchical-scope-model.md) for the architectural decision.

## Data Model

### Scope Format

Scopes are dot-separated hierarchical identifiers stored in the engram frontmatter `scopes` array:

```
personal.journal
personal.secret.therapy
work.projects.karbon
work.secret.jobsearch
storage.recipes
```

**Format rules:**

| Property            | Constraint                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| Character set       | Lowercase alphanumeric and hyphens only (`[a-z0-9-]`), separated by `.`   |
| Minimum depth       | At least two segments (`personal.journal`, not `personal`)                |
| Maximum depth       | 6 segments                                                                |
| Segment length      | 1-32 characters per segment                                               |
| Reserved segments   | `.secret.` — marks content requiring explicit opt-in for output inclusion |
| Reserved top-levels | `personal`, `work`, `storage` are conventional but not enforced           |

### Scope Rules Configuration (`scope-rules.toml`)

Lives at `engrams/.config/scope-rules.toml`. Pattern-based rules for automatic scope assignment:

```toml
[defaults]
fallback_scope = "personal.captures"

[[rules]]
match = { source = "github" }
assign = ["work.projects"]
priority = 10

[[rules]]
match = { source = "moltbot" }
assign = ["personal.captures"]
priority = 20

[[rules]]
match = { source = "manual", tags = ["therapy"] }
assign = ["personal.secret.therapy"]
priority = 30

[[rules]]
match = { type = "journal" }
assign = ["personal.journal"]
priority = 5
```

**Rule fields:**

| Field      | Type     | Description                                                               |
| ---------- | -------- | ------------------------------------------------------------------------- |
| `match`    | object   | Conditions — any combination of `source`, `type`, `tags` (all must match) |
| `assign`   | string[] | Scopes to add when the rule matches                                       |
| `priority` | number   | Higher priority rules override lower ones when conflicts arise            |

### Database (engram_scopes table)

Defined in PRD-077. Junction table linking engrams to their scopes:

| Column    | Type | Constraints                    | Description       |
| --------- | ---- | ------------------------------ | ----------------- |
| engram_id | TEXT | FK → engram_index.id, NOT NULL | Engram reference  |
| scope     | TEXT | NOT NULL                       | Full scope string |

**Indexes:** Composite `(engram_id, scope)` unique, `scope` for prefix queries (`WHERE scope LIKE 'work.%'`).

## API Surface

| Procedure                    | Input                                     | Output                                     | Notes                                                                          |
| ---------------------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `cerebrum.scopes.assign`     | engramId, scopes: string[]                | `{ engram: Engram }`                       | Adds scopes to engram (validates format, updates file + index)                 |
| `cerebrum.scopes.remove`     | engramId, scopes: string[]                | `{ engram: Engram }`                       | Removes scopes (must retain at least one scope)                                |
| `cerebrum.scopes.reclassify` | fromScope, toScope, dryRun?               | `{ affected: number, engrams?: string[] }` | Bulk rename — replaces scope prefix across all matching engrams                |
| `cerebrum.scopes.list`       | prefix?                                   | `{ scopes: ScopeInfo[] }`                  | All known scopes with engram counts, optionally filtered by prefix             |
| `cerebrum.scopes.validate`   | scope: string                             | `{ valid: boolean, errors?: string[] }`    | Validates a scope string against format rules                                  |
| `cerebrum.scopes.filter`     | scopes: string[], includeSecret?: boolean | `{ engrams: Engram[] }`                    | Returns engrams matching scope prefixes, excludes `*.secret.*` unless opted in |

## Business Rules

- Every engram must have at least one scope at all times — removing the last scope is rejected with an error
- Scope assignment follows a three-tier priority: (1) explicit user assignment, (2) rule-based inference from `scope-rules.toml`, (3) fallback to `defaults.fallback_scope`
- The `.secret.` segment is reserved — any scope containing `.secret.` as a segment marks the engram as secret for output filtering purposes
- Secret scopes are hard-blocked from all shared outputs (reports, summaries, chat responses in non-personal contexts) unless the caller explicitly passes `includeSecret: true`
- Scope rules are additive — a matching rule adds scopes, it does not replace existing ones
- When multiple rules match, all matching rules' scopes are assigned (rules do not conflict — they accumulate)
- Priority is used for conflict resolution only when two rules would assign contradictory scopes (e.g., one assigns `personal.*` and another assigns `work.*` for the same match)
- Reclassify is atomic — if any engram file update fails during a bulk reclassify, the entire operation rolls back
- Scope strings are case-insensitive on input but stored lowercase — `Work.Projects` is normalised to `work.projects`
- An engram with a `*.secret.*` scope and a non-secret scope is still treated as secret — the most restrictive scope wins for filtering

## Edge Cases

| Case                                                               | Behaviour                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Engram created with no scopes and no matching rule                 | Assigned `defaults.fallback_scope` from `scope-rules.toml`                     |
| Scope string with trailing dot (`work.projects.`)                  | Validation rejects — trailing dots are invalid                                 |
| Scope string with consecutive dots (`work..projects`)              | Validation rejects — empty segments are invalid                                |
| Scope with uppercase letters                                       | Normalised to lowercase, not rejected                                          |
| Removing the last scope from an engram                             | Rejected with error — engrams must always have at least one scope              |
| Reclassify `fromScope` matches zero engrams                        | Returns `{ affected: 0 }` — no error                                           |
| Reclassify target scope fails validation                           | Rejected before any engrams are modified                                       |
| `scope-rules.toml` is missing or unparseable                       | System falls back to `personal.captures` as default scope, warning logged      |
| Engram belongs to both `work.projects` and `work.secret.jobsearch` | Engram is treated as secret — presence of any secret scope triggers protection |
| Scope depth exceeds 6 segments                                     | Validation rejects — too deep                                                  |
| Prefix query `work` (no wildcard)                                  | Matches `work.*` — single-segment prefix treated as top-level filter           |

## User Stories

| #   | Story                                                       | Summary                                                                            | Status      | Parallelisable                 |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| 01  | [us-01-scope-schema](us-01-scope-schema.md)                 | Scope format validation, hierarchy parsing, prefix matching utilities              | Not started | No (first)                     |
| 02  | [us-02-scope-rules](us-02-scope-rules.md)                   | Rule engine reading scope-rules.toml — pattern matching, auto-assignment, defaults | Not started | Blocked by us-01               |
| 03  | [us-03-scope-filtering](us-03-scope-filtering.md)           | Query-time scope filtering with prefix matching and secret scope hard-blocking     | Not started | Blocked by us-01               |
| 04  | [us-04-scope-management-api](us-04-scope-management-api.md) | tRPC procedures for scope CRUD, reclassify, listing, and validation                | Not started | Blocked by us-01, us-02, us-03 |

US-02 and US-03 can parallelise with each other after US-01 is complete. US-04 depends on all three prior stories.

## Verification

- A scope string like `work.projects.karbon` passes validation; `Work..Projects.` is rejected
- An engram created via source `github` with no explicit scopes is auto-assigned `work.projects` by the rule engine
- Querying with `work.*` returns engrams scoped to `work.projects.karbon` but not `personal.journal`
- Querying with `work.*` does not return engrams scoped to `work.secret.jobsearch` unless `includeSecret: true` is passed
- An engram with scopes `[work.projects.karbon, work.secret.jobsearch]` is excluded from non-secret queries
- `cerebrum.scopes.reclassify({ fromScope: "work.projects.old", toScope: "work.projects.new" })` updates all matching engram files and index entries atomically
- `cerebrum.scopes.list()` returns all known scopes with accurate engram counts
- Removing the last scope from an engram returns an error
- A missing or corrupt `scope-rules.toml` does not crash the system — it falls back to the default scope

## Out of Scope

- LLM-based scope classification (PRD-081 — Cortex Classification)
- Scope-aware output rendering and formatting (Epic 03 — Emit)
- Scope-based consolidation boundaries (PRD-085 — Glia Curation)
- UI for scope management (future — Cerebrum has no dedicated UI in this phase)
- Scope permissions or multi-user access control — this is output filtering, not auth

## Drift Check

last checked: 2026-04-17
