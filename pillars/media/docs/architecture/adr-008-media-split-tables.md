# ADR-008: Split Tables for Media Schema

## Status

Accepted

## Context

The media domain stores movies and TV shows. TV shows have a hierarchical structure (show > season > episode) that movies don't. The schema needs to handle both while enforcing the TV hierarchy.

## Options Considered

| Option                                                       | Pros                                                                                               | Cons                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unified `media_items` table with type discriminator          | One table, simpler joins for cross-type features                                                   | Many nullable columns, no FK-enforced hierarchy, queries need `WHERE type = ...` everywhere, complex partial indexes for TV constraints |
| Separate tables: `movies`, `tv_shows`, `seasons`, `episodes` | Clean FK-enforced TV hierarchy, no nullable type-specific columns, natural indexes, focused tables | Cross-type features (watchlist, comparisons) need polymorphic reference pattern (`media_type + media_id`), more tables                  |

## Decision

Separate tables. The TV hierarchy (show > season > episode) is a real structural relationship. Encoding it as self-referential `parent_id` in a unified table loses FK enforcement, makes cascade deletes fragile, and requires application-level validation for constraints the database should own.

The polymorphic reference trade-off for cross-type features is acceptable at this scale (~8,100 rows). Application-level validation in tRPC procedures handles the integrity that FKs can't.

## Consequences

- Four media tables: `movies`, `tv_shows`, `seasons`, `episodes`
- TV hierarchy is FK-enforced with `ON DELETE CASCADE`
- Cross-type features (watchlist, comparisons, scores) use `media_type + media_id` with application-level validation
- Adding a new media type means a new table, not a new discriminator value
