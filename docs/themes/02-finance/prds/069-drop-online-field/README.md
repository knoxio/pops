# PRD-069: Drop the `online` transaction field

> Epic: [01 — Import Pipeline](../../epics/01-import-pipeline.md)
> Status: Done

## Overview

Remove the `online` boolean from the import pipeline and its UI surfaces. The field never persisted to the `transactions` table — it was an in-flight import attribute used to drive a Globe/Store badge and a hardcoded Amex description heuristic. Anything users want to express about "online vs in-person" is expressed instead as a regular tag, applied via the existing `transaction_tag_rules` system. One model, one mechanism, no parallel taxonomy.

## Data Model

No DB schema change. The `online` column does not exist in the `transactions` table today.

The field is removed from the in-memory import schemas only:

- `parsedTransactionSchema` — drop `online: z.boolean().optional()`
- `confirmedTransactionSchema` — inherits the drop

The existing `transaction_tag_rules` table is the replacement mechanism. It already supports `descriptionPattern` + `matchType` + `tags[]` + optional `entityId` scope, which is sufficient to express any "auto-tag this as online" rule a user wants.

## API Surface

No procedure signatures change. The removed field simply stops being accepted on import-related inputs and stops being emitted on import-related outputs:

- `finance.imports.parseRows` — return type no longer carries `online`
- `finance.imports.processImport` — input no longer accepts `online`
- `finance.imports.confirmImport` (or equivalent) — input no longer accepts `online`

Tag-related procedures are untouched; they already handle the use case.

## Business Rules

- Import pipeline does **not** infer "online vs in-person" automatically. The Amex `detectOnline` heuristic and its frontend duplicate (`ColumnMapStep`) are deleted, not migrated.
- Users who want their `.COM.AU` / `PAYPAL` / `AMAZON` transactions auto-tagged author a normal tag rule via the existing UI. There are no seeded "online" tag rules and no system-tag concept.
- The transaction edit form during import review does not expose any online toggle. Tag editing already exists for the same purpose.
- The transaction card during import review does not render any online/in-person badge. The tag chips already render whatever tags the txn has.

## Edge Cases

| Case                                             | Behaviour                                                                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing test fixtures set `online: true`        | Update the fixture; the field is silently dropped at the schema level so leaving it would surface as a Zod failure.                                                                    |
| User had implicitly relied on the Amex heuristic | They can recreate it as a tag rule (`description contains ".COM.AU"` → tag `online`) in the existing tag-rule UI. Not migrated automatically — there is no persisted state to migrate. |
| Other parsers (ANZ, ING, Up Bank) emit `online`  | None do today. If a future parser wants to set "online", it sets a tag, not a field.                                                                                                   |

## User Stories

| #   | Story                                                 | Summary                                                                   | Status                                   | Parallelisable            |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- | ------------------------- |
| 01  | [us-01-drop-online-field](us-01-drop-online-field.md) | Delete `online` from import schemas, parsers, edit form, badge, and tests | Done | No (single atomic change) |

## Out of Scope

- Auto-creating tag rules in seed data for the deleted Amex heuristic. Users opt in via the existing tag-rule UI.
- A "system tag" vs "user tag" distinction at runtime. The vocabulary table's `source: "seed"` field already exists if seed data ever wants to ship default tags; this PRD does not use it.
- Any change to the persisted `transactions` schema or migrations.
- Any change to `transaction_tag_rules` table or its CRUD endpoints.
