# Comparison History Enhancements

> Status: Done

The comparison history view lists every recorded 1v1 comparison, newest first, with the ELO points each title gained or lost, a movie-title search box, a dimension filter, pagination, and an undo-able delete.

## Data Model

`comparisons` table carries two nullable ELO-delta columns alongside the pair/winner/dimension fields:

| Column    | Type                 | Description                                     |
| --------- | -------------------- | ----------------------------------------------- |
| `delta_a` | `INTEGER` (nullable) | ELO point change for media A in this comparison |
| `delta_b` | `INTEGER` (nullable) | ELO point change for media B in this comparison |

`NULL` only on comparisons recorded before deltas existed; no backfill is performed. Deltas are computed from the same ELO engine that updates `media_scores`:

- Expected score: `1 / (1 + 10^((ratingB − ratingA) / 400))`.
- `delta = round(newScore − oldScore)` where `newScore = oldScore + K × (actual − expected)`, `K` from settings (default 32).
- Win/loss: winner `actual = 1`, loser `actual = 0`. Draw (`winnerId = 0`): both sides take the draw-tier outcome (`high` → 0.7, `mid`/null → 0.5, `low` → 0.3), so a draw can move both scores up, down, or neither.

## REST API

Contract: `pillars/media/src/contract/rest-comparisons.ts`, served under the media pillar.

- `GET /comparisons` — list all comparisons, newest first. Query: `dimensionId?`, `search?` (movie-title `LIKE`, max 100 chars), `limit?` (≤100), `offset?`. Returns `{ data: Comparison[], pagination }`.
- `DELETE /comparisons/:id` — delete one comparison, then replay-recalculate its dimension's ELO.

`Comparison` wire shape exposes `deltaA: number | null` and `deltaB: number | null` via `toComparison()`, which maps `row.deltaA ?? null` / `row.deltaB ?? null`.

## Business Rules

- Deltas are computed and stored in the same transaction as the comparison insert; ELO scores are written before the delta is read, so the stored delta is the exact per-row score change.
- A `NULL`-delta comparison renders without a badge and without error.
- For draws (`winnerId = 0`), deltas are stored and shown for both sides; the row labels both titles as "tied".
- Deltas are NOT immutable snapshots. A full replay — triggered by `DELETE /comparisons/:id`, blacklisting a movie, or a dimension/all recalc — resets `media_scores` to baseline, replays every comparison for the dimension in `compared_at` order, and rewrites each comparison's `delta_a`/`delta_b` to the recomputed value. Stored deltas therefore always reflect the latest replay, not the moment of original recording.

## UI

`ComparisonHistoryPage` (`pillars/media/app`):

- Each row shows the pairing inline with compact coloured ELO badges, e.g. `The Matrix +12  beat  Inception −12   CINEMATOGRAPHY  4/6/2026  🗑`.
- Badge styling: `text-2xs font-mono tabular-nums`, green tint (`text-success bg-success/10`) for a positive delta, red tint (`text-destructive bg-destructive/10`) for a negative delta. No badge when the delta is `null`.
- Win rows render winner-first ("beat"); draw rows render both titles with "tied".
- Filters bar: debounced movie-title search input (300 ms) and a dimension dropdown; changing either resets to page 0. Total count and prev/next pagination (page size 20) are shown.
- Delete is optimistic with a 5 s undo window: clicking the trash icon hides the row immediately and shows an undo toast; if undone, the row returns and no request is sent; otherwise the `DELETE` fires after the window and the list invalidates.

## Acceptance Criteria

- [x] `comparisons` has nullable `delta_a` / `delta_b` integer columns.
- [x] `recordComparison` computes `round(K × (actual − expected))` per side and stores both deltas atomically with the insert.
- [x] `Comparison` API shape exposes `deltaA: number | null` and `deltaB: number | null`.
- [x] `GET /comparisons` supports `dimensionId`, movie-title `search`, and `limit`/`offset` pagination; `DELETE /comparisons/:id` removes a row and replays the dimension's ELO.
- [x] History rows render a green `+N` badge for the gainer and a red `−N` badge for the loser; no badge when the delta is `null`.
- [x] Draws show both titles as "tied" with both deltas.
- [x] A full replay (delete / blacklist / recalc) rewrites the stored deltas on the surviving rows.
- [x] Delete is undo-able within a 5 s window before the request is sent.
