# Search

## Purpose

`contacts` exposes a search adapter so the `orchestrator` can federate contact
matches into unified search. This unit is one endpoint, `POST /search`, that
ranks entities by name against a query and returns canonical-URI hits. The
manifest declares the adapter (`name: contacts`, `entityType: contact`,
`procedurePath: contacts.search.search`, `rankFieldName: score`,
`queryShape.supportsText: true`) so the orchestrator knows how to call it.

## REST API

| Method | Path      | Body                            | Response                |
| ------ | --------- | ------------------------------- | ----------------------- |
| `POST` | `/search` | `{ query: { text }, context? }` | `{ hits: SearchHit[] }` |

- `query.text` is the search term.
- `context` is accepted and ignored — it exists only for wire parity with the
  orchestrator's request shape.

### `SearchHit`

```
uri: string          // pops:contacts/contact/<id>
score: number        // 1.0 exact, 0.8 prefix, 0.5 contains
matchField: "name"
matchType: "exact" | "prefix" | "contains"
data: { name, type, aliases: string[] }
```

## Rules

- **Scoring is name-only and case-insensitive:** an exact name match scores
  `1.0` (`matchType: exact`), a prefix match `0.8` (`prefix`), and a substring
  match `0.5` (`contains`).
- **Candidates come from a `LIKE %text%` scan on name;** any candidate that does
  not actually contain the (lowercased) query is dropped, so a collation
  over-match never produces a spurious hit.
- **Hits are sorted by score descending** and **capped at 20**.
- **An empty/whitespace-only query returns `{ hits: [] }`** without touching the
  database.
- **`uri` is the canonical contact URI** `pops:contacts/contact/<id>`, resolvable
  back to this pillar.
- The adapter advertises `supportsText: true` only — it does **not** support tag,
  date-range, or scope filtering (`supportsTags`/`supportsDateRange` false,
  `supportsScope: []`).

## Acceptance criteria

- [x] `POST /search` ranks entities by name: exact `1.0`, prefix `0.8`, contains `0.5`, all case-insensitive.
- [x] Each hit carries `uri` = `pops:contacts/contact/<id>`, `matchField: "name"`, the `matchType`, the `score`, and `data: { name, type, aliases }`.
- [x] Results are sorted by score descending and truncated to 20.
- [x] A blank query short-circuits to an empty hit list with no DB query.
- [x] A `LIKE` candidate whose name does not actually contain the query is filtered out (no false hit).
- [x] `context` is accepted and ignored.
- [x] The manifest declares a single `contacts` search adapter with `entityType: contact`, `procedurePath: contacts.search.search`, `rankFieldName: score`, and a text-only query shape so the orchestrator federates it.
