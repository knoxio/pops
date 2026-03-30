# ADR-012: Universal Object URI Scheme

## Status

Accepted

## Context

POPS is a multi-domain platform where objects in one domain frequently reference objects in another (inventory items link to purchase transactions, comparisons reference movies, receipts link to items). As the AI overlay (Phase 3) and universal search are built, a system-wide way to address any object becomes essential.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| UUID on every table | Globally unique, no parsing needed | Opaque (can't tell what it refers to), slower to index, adds a column to every table for a future feature |
| Global registry table (`objects`) | Single table for universal search | Write amplification, sync issues, significant overhead |
| URI convention with a resolver | Zero schema changes, human-readable, parseable, incremental adoption | Not stored as a column — referencing systems store the URI as a string, no DB-level enforcement |

## Decision

URI convention with a resolver. The URI is a string format any part of the system can construct from existing data:

```
pops:{domain}/{type}/{id}
```

Examples: `pops:finance/transaction/1234`, `pops:media/movie/42`, `pops:inventory/item/18`

Rules:
- `domain` matches the API module name (finance, media, inventory, core)
- `type` is singular, kebab-case (transaction, movie, tv-show)
- `id` is the primary key
- Case-sensitive, lowercase only
- A URI always resolves to exactly one row in one table

The resolver (a function that parses a URI and returns the referenced object) gets built when the AI overlay or universal search needs it.

## Consequences

- Zero schema changes — convention only, no infrastructure
- Every object in the system is addressable via a human-readable URI
- AI overlay can accept/return URIs to reference any object
- PWA deep links map directly: `/media/movies/42` <> `pops:media/movie/42`
- Existing polymorphic patterns (`media_type + media_id`) are compatible — can be constructed into URIs
- Incremental adoption, no big-bang migration
