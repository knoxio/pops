# Batch & Cook-Event Model — Deferred Extensions

Forward-looking extensions to the shipped batch/recipe-run/consumption data model (`prds/108-batch-model`). None of these are built; the v1 model deliberately leaves them out.

## `purchases` table for `source_type='purchase'` provenance

Today a manually-created `purchase` batch sets `source_id = null` and uses free-form `notes` for any receipt reference. Build a `purchases` table and FK `batches.source_id` to it when `source_type='purchase'` (keeping the polymorphism service-enforced). Likely a cross-domain table shared with the finance pillar — a purchase has a price, a vendor, a date — so this probably belongs to a shared provenance domain rather than food alone. Resolve ownership before building.

## Expiry alerts / notifications

`batches.expires_at` is populated but nothing reads it for alerting. Build a worker job (or registry-driven nudge) that surfaces batches approaching or past expiry. The consumption helper deliberately does not filter by expiry — expired stock is still consumable — so alerting is a separate read path over `(location, expires_at)`.

## Unit conversion at consume time

`consumeForRun` assumes `recipe_lines` already carry the canonical metric and that batches store in that same unit; it does no cross-unit conversion and `batch_consumptions` stores only the batch's native unit (to avoid double-conversion drift). A need in `count` cannot draw from a batch stored in `g`. Add a conversion layer that resolves a need against batches in a different-but-convertible unit using the food pillar's conversion graph, recording the converted quantity.

## Multi-output recipes

A run yields at most one batch (`recipe_runs.yielded_batch_id`, single FK). Real cooks branch: a roast chicken → meat + bones + stock. Model multiple yields per run (a `recipe_run_yields` join, or a yield-spec on the recipe version) so one cook event can produce several distinct batches. This was explicitly deferred at the single-yield decision; revisit with a concrete multi-output recipe in hand.

## Substitution-aware consumption

v1 consumption is strict by prep state and variant: a `diced` line only draws from `diced` batches, never from `whole`. Add an opt-in mode where a need can consume a compatible batch (whole onions for a diced line, "the cook will dice as needed") using the substitution graph and prep-state compatibility rules. Must stay opt-in — silent substitution would corrupt FIFO assumptions and shortfall reporting.
