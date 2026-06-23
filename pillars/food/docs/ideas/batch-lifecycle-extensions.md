# Batch Lifecycle — Deferred Extensions

Forward-looking extensions to the shipped batch lifecycle (`prds/batch-lifecycle`). None of these are built; v1 deliberately leaves them out. Data-model-level extensions (`purchases` table, expiry alerts, unit conversion, multi-output recipes, substitution-aware consumption) live in `batch-model-extensions.md` instead.

## Structured `batch_events` audit table

The v1 audit trail is a free-form `batches.notes` string that relocate / adjust append to, front-truncated at 500 chars. Once it overflows, the oldest lines are lost; a user `editBatch` of notes wipes the prior audit lines entirely. Build a dedicated `batch_events` table (one row per relocate / adjust / delete, with actor / timestamp / before-after) so the audit trail is queryable, untruncated, and survives notes edits. The notes field then returns to being purely user-authored.

## Batch templates

Frequently-bought items (a weekly 1L milk, a dozen eggs) are re-typed into the manual-entry form every time. Build "batch templates" — a saved (variant, prep state, unit, location, default shelf life) prefill the user can one-tap to create a batch. Only worth it if manual entry proves frequent enough.

## Bulk batch operations

Every mutation is per-row: relocate one, delete one, adjust one. Add bulk variants (relocate-many / delete-many / adjust-many) for "clearing out the fridge" or "moving everything to the freezer" sweeps. Keep the per-row services as the primitives and layer bulk as a batched transaction over them.

## Cross-batch transfers (portioning)

There is no "move 100g from batch A to batch B" operation — to portion, the user creates a new batch and adjusts the old one down by hand, which breaks the provenance/expiry link. Build a transfer operation that splits a batch (or merges compatible ones), carrying produced_at / expiry / source provenance correctly so portioned stock keeps its real age.

## External-system / receipt ingestion

Manual entry is keyboard-only. Add ingestion from external sources — a receipt scan (cross-domain with the finance pillar), an inventory/barcode scanner, or a delivery-order import — that creates batches in bulk with resolved variants and quantities. Receipt scanning specifically overlaps the deferred `purchases` provenance table; resolve that ownership first.
