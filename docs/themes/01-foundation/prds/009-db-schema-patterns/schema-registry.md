# Schema Registry

> Living document — update when migrations add or remove tables.
> Last verified against `packages/db-types/src/schema/` on 2026-03-27.

## Tables by Domain

### Core

Shared infrastructure tables with no domain prefix.

| Table        | PK Type     | Description                                                 |
| ------------ | ----------- | ----------------------------------------------------------- |
| entities     | TEXT (UUID) | People, companies, brands, places, organisations            |
| settings     | TEXT (key)  | Key-value application configuration                         |
| ai_usage     | INTEGER     | Claude API usage tracking                                   |
| environments | TEXT (UUID) | Named database environments for testing                     |
| locations    | TEXT (UUID) | Hierarchical location tree (self-referential via parent_id) |

### Finance

| Table                   | PK Type     | Description                                   |
| ----------------------- | ----------- | --------------------------------------------- |
| transactions            | TEXT (UUID) | Bank transactions (all accounts)              |
| transaction_corrections | TEXT (UUID) | Entity matching corrections for import review |
| budgets                 | TEXT (UUID) | Monthly/yearly budget targets by category     |

### Inventory

| Table            | PK Type     | Description                                          |
| ---------------- | ----------- | ---------------------------------------------------- |
| home_inventory   | TEXT (UUID) | Physical items (electronics, furniture, etc.)        |
| item_connections | INTEGER     | Links between related items (e.g., charger → laptop) |
| item_photos      | INTEGER     | Photos attached to inventory items                   |
| item_documents   | INTEGER     | Documents attached to inventory items                |
| wish_list        | TEXT (UUID) | Items to purchase                                    |

### Media

| Table                 | PK Type | Description                             |
| --------------------- | ------- | --------------------------------------- |
| movies                | INTEGER | Movie library (TMDB metadata)           |
| tv_shows              | INTEGER | TV show library (TheTVDB metadata)      |
| seasons               | INTEGER | TV seasons (child of tv_shows)          |
| episodes              | INTEGER | TV episodes (child of seasons)          |
| watchlist             | INTEGER | Media watchlist entries                 |
| watch_history         | INTEGER | Completed watch events                  |
| comparison_dimensions | INTEGER | Scoring dimensions (e.g., Acting, Plot) |
| comparisons           | INTEGER | Head-to-head comparison results         |
| media_scores          | INTEGER | Per-dimension scores for media items    |

## Cross-Domain Foreign Keys

All cross-domain FKs follow these rules:

- **Type:** TEXT (UUID references only)
- **Nullable:** Always — the link is optional
- **On Delete:** SET NULL — breaking a link doesn't cascade destruction
- **On Update:** CASCADE — if an ID changes, propagate

| Source Table            | Column                  | Target Table | Target Domain | Cascade  |
| ----------------------- | ----------------------- | ------------ | ------------- | -------- |
| home_inventory          | purchase_transaction_id | transactions | finance       | SET NULL |
| home_inventory          | purchased_from_id       | entities     | core          | SET NULL |
| home_inventory          | location_id             | locations    | core          | SET NULL |
| transactions            | entity_id               | entities     | core          | SET NULL |
| transaction_corrections | entity_id               | entities     | core          | SET NULL |

### Domain Interaction Diagram

```
  inventory ──→ finance (purchase_transaction_id)
  inventory ──→ core   (purchased_from_id, location_id)
  finance   ──→ core   (entity_id × 2)
  media     ──  (internal only, no cross-domain FKs)
```

## Within-Domain Foreign Keys

These follow domain-specific conventions (may use INTEGER PKs and CASCADE deletes).

| Source Table     | Column     | Target Table   | Cascade |
| ---------------- | ---------- | -------------- | ------- |
| locations        | parent_id  | locations      | CASCADE |
| item_connections | item_a_id  | home_inventory | CASCADE |
| item_connections | item_b_id  | home_inventory | CASCADE |
| item_photos      | item_id    | home_inventory | CASCADE |
| item_documents   | item_id    | home_inventory | CASCADE |
| seasons          | tv_show_id | tv_shows       | CASCADE |
| episodes         | season_id  | seasons        | CASCADE |

## Naming Conventions

| Convention    | Rule                         | Examples                                     |
| ------------- | ---------------------------- | -------------------------------------------- |
| Table names   | snake_case, plural           | `transactions`, `budgets`, `movies`          |
| Domain prefix | New domain tables use prefix | `media_scores`, `comparison_dimensions`      |
| Core tables   | No prefix (shared)           | `entities`, `settings`, `locations`          |
| Column names  | snake_case                   | `purchase_date`, `created_at`                |
| FK columns    | `<target>_id`                | `entity_id`, `location_id`, `season_id`      |
| Index names   | `idx_<table>_<column>`       | `idx_inventory_type`, `idx_locations_parent` |

## Standard Column Patterns

| Column           | Type            | Default               | Required | Notes                                                   |
| ---------------- | --------------- | --------------------- | -------- | ------------------------------------------------------- |
| id               | TEXT or INTEGER | UUID or autoincrement | Yes      | TEXT UUID for core/finance/inventory, INTEGER for media |
| created_at       | TEXT            | `datetime('now')`     | Yes      | ISO 8601 timestamp                                      |
| updated_at       | TEXT            | `datetime('now')`     | Yes      | Updated on each write                                   |
| last_edited_time | TEXT            | —                     | Varies   | Notion sync timestamp (legacy, being phased out)        |

## Convention: TEXT vs INTEGER PKs

- **TEXT (UUID):** Core, finance, and inventory domains. Items may be referenced from external systems, need stable portable IDs.
- **INTEGER (autoincrement):** Media domain. Internal-only data, optimised for SQLite integer PK performance. External IDs stored separately (tmdb_id, tvdb_id).
