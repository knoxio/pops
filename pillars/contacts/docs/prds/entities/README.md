# Entities

## Purpose

Entities are the contact directory — the people, companies, governments, banks,
places, brands, and organisations that other pillars reference. `contacts` is the
single authoritative store: it owns the `entities` table in `contacts.db` and is
the only writer. finance and every other consumer read entities over HTTP via
`pillar('contacts').entities.*`; none of them keep their own copy.

This unit covers the entity CRUD surface, the filtered/paginated list, and the
bulk match-column lookup that backs the finance import matcher.

## Data model

Table `entities` (migration `0002_entities.sql`):

| Column                     | Type | Constraints                       | Notes                                                                           |
| -------------------------- | ---- | --------------------------------- | ------------------------------------------------------------------------------- |
| `id`                       | TEXT | PK                                | Server-assigned v4 UUID on create.                                              |
| `notion_id`                | TEXT | UNIQUE, nullable                  | Integration key. Never projected to the wire.                                   |
| `name`                     | TEXT | NOT NULL, UNIQUE `COLLATE NOCASE` | Display name. Case-insensitive uniqueness (`0003_entities_name_ci_unique.sql`). |
| `type`                     | TEXT | NOT NULL, DEFAULT `'company'`     | One of the seven entity types below.                                            |
| `abn`                      | TEXT | nullable                          | Australian Business Number.                                                     |
| `aliases`                  | TEXT | nullable                          | Opaque CSV on disk; `string[]` on the wire.                                     |
| `default_transaction_type` | TEXT | nullable                          | Suggested transaction type when matched.                                        |
| `default_tags`             | TEXT | nullable                          | Opaque JSON array on disk; `string[]` on the wire.                              |
| `notes`                    | TEXT | nullable                          | Free-form.                                                                      |
| `last_edited_time`         | TEXT | NOT NULL                          | RFC 3339 / ISO 8601 UTC. Server-stamped.                                        |
| `owner_uri`                | TEXT | nullable, indexed                 | Denormalized backfill pointer. Never projected to the wire.                     |
| `owner_uri_stale_at`       | TEXT | nullable                          | Backfill bookkeeping. Never projected to the wire.                              |

Entity types: `company` (default), `person`, `government`, `bank`, `place`,
`brand`, `organisation`.

### Wire shape (`Entity`)

camelCase, integration columns omitted:

```
id, name, type, abn?, aliases: string[], defaultTransactionType?,
defaultTags: string[], notes?, lastEditedTime
```

- `aliases` decodes from CSV by splitting on `,`, trimming, dropping empties;
  encodes back via `join(", ")` (or `null` when empty).
- `defaultTags` decodes from a JSON array string; a malformed value yields `[]`
  rather than erroring. Encodes via `JSON.stringify` (or `null` when empty).

## REST API

All responses use the shared envelope: list endpoints wrap
`{ data, pagination: { total, limit, offset, hasMore } }`; errors are
`{ message, code }`.

| Method   | Path               | Body / query                                                                     | Response                                           |
| -------- | ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GET`    | `/entities`        | `search?`, `type?`, `limit?` (default 50, max 200), `offset?` (default 0)        | `{ data: Entity[], pagination }`                   |
| `GET`    | `/entities/{id}`   | —                                                                                | `{ data: Entity }` (404 if absent)                 |
| `POST`   | `/entities`        | `{ name, type?, abn?, aliases?, defaultTransactionType?, defaultTags?, notes? }` | `201 { data: Entity, message }`                    |
| `PATCH`  | `/entities/{id}`   | partial of the create body                                                       | `{ data: Entity, message }`                        |
| `DELETE` | `/entities/{id}`   | —                                                                                | `{ message }` (404 if absent)                      |
| `POST`   | `/entities/lookup` | `{ fields? }` (currently ignored)                                                | `{ entities: { id, name, aliases }[], fetchedAt }` |

`fetchedAt` on the lookup response is the fetch instant, for the caller's in-run
cache. The `fields` selector is reserved; an empty body returns the default
match columns.

## Rules

- **Name uniqueness is case-insensitive.** `ACME` and `Acme` collide. Enforced
  both by a pre-check (`COLLATE NOCASE`) and by the `idx_entities_name_nocase`
  unique index, so a create racing past the pre-check still fails closed instead
  of inserting a duplicate. A duplicate create or a rename onto another row's
  name returns `409 ConflictError`.
- **Renaming an entity to its own name is allowed** (the conflict check excludes
  the row being updated).
- **`type` is validated at the route boundary.** A value outside the seven types
  returns `400 BadRequestError` listing the legal values. Omitting `type` on
  create defaults to `company`.
- **`name` must be non-empty.** A blank/whitespace-only name on create, or a
  present blank name on update, returns `400`.
- **PATCH is a true partial update.** An absent field is left untouched. A
  nullable field present as `null` clears the column; present with a value sets
  it. `lastEditedTime` is bumped only when at least one column actually changes.
- **Ordering is case-insensitive by name** (`COLLATE NOCASE`) on both list and
  bulk lookup.
- **`limit` is clamped to `[1, 200]`; `offset` floors at 0.** `pagination.hasMore`
  is `offset + limit < total`.
- **List filters are ANDed:** optional `search` is a `LIKE %term%` on name,
  optional `type` is an exact match.
- **A non-name unique violation is not a name conflict.** A `notion_id` collision
  surfaces as a raw error, not a 409 duplicate-name, so consumers are not misled.

## Edge cases

| Case                                            | Behaviour                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Duplicate name (any casing) on create           | `409 ConflictError`.                                                                                  |
| Rename onto an existing name (any casing)       | `409 ConflictError`.                                                                                  |
| Rename onto own name                            | Succeeds (no-op conflict).                                                                            |
| Aliases with whitespace-only / empty segments   | Stripped on decode; not stored as aliases.                                                            |
| Malformed `default_tags` JSON in a row          | Decodes to `[]`, no error.                                                                            |
| `type` outside the seven values                 | `400 BadRequestError`.                                                                                |
| Blank name on create or update                  | `400 BadRequestError`.                                                                                |
| GET/PATCH/DELETE on a missing id                | `404 NotFoundError`.                                                                                  |
| `notion_id` unique collision on a direct insert | Surfaces as a DB error, never mislabeled as a duplicate name.                                         |
| Concurrent create of the same name              | The unique index fails the loser closed; it resolves to the same 409 the pre-check would have raised. |

## Acceptance criteria

- [x] `entities` table created with all columns per the data model (`0002_entities.sql`).
- [x] CRUD over REST: list (with `search`, `type`, `limit`, `offset`), get, create, update, delete.
- [x] Case-insensitive unique name enforcement, in both a pre-check and a DB unique index; returns `409` on conflict.
- [x] A `notion_id` (or other non-name) unique violation is not misclassified as a duplicate-name conflict.
- [x] Aliases: API accepts `string[]`, stores as CSV, returns `string[]`; whitespace-only/empty segments stripped.
- [x] Default tags: API accepts `string[]`, stores as JSON array, returns `string[]`; malformed stored JSON decodes to `[]`.
- [x] `type` defaults to `company`; values outside the seven types return `400`.
- [x] Blank/whitespace-only name returns `400` on create and on update.
- [x] PATCH is partial: absent fields untouched, present `null` clears a nullable column, `lastEditedTime` bumps only on a real change.
- [x] List orders case-insensitively by name and paginates; `hasMore` reflects remaining rows.
- [x] `POST /entities/lookup` returns every contact's `{ id, name, aliases }` in one round-trip plus a `fetchedAt` instant.
- [x] Aliases and default tags round-trip through a DB write/read unchanged.
- [x] Integration columns (`notionId`, `ownerUri`, `ownerUriStaleAt`) are never present on the wire.
- [x] Tests cover CRUD, case-insensitive duplicate prevention, the unique-index race, alias/tag serialization, partial update, and pagination.
