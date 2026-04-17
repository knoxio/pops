# US-08: Log Retention & Archival

> PRD: [PRD-092: AI Observability Platform](README.md)

## Description

As a system administrator, I want inference logs to be automatically retained for a configurable period with older data aggregated into daily summaries so that the database stays performant while historical trends remain accessible on the dashboard.

## Acceptance Criteria

- [ ] Retention period is configurable via a settings key (`ai.logRetentionDays`, default 90). The value can be updated through the existing settings API.
- [ ] `ai_inference_daily` Drizzle schema exists with columns: `id` (INTEGER PK, auto-increment), `date` (TEXT, NOT NULL — ISO date `YYYY-MM-DD`), `provider` (TEXT, NOT NULL), `model` (TEXT, NOT NULL), `operation` (TEXT, NOT NULL), `domain` (TEXT, nullable), `total_calls` (INTEGER, NOT NULL), `total_input_tokens` (INTEGER, NOT NULL), `total_output_tokens` (INTEGER, NOT NULL), `total_cost_usd` (REAL, NOT NULL), `avg_latency_ms` (INTEGER, NOT NULL), `error_count` (INTEGER, NOT NULL), `timeout_count` (INTEGER, NOT NULL), `cache_hit_count` (INTEGER, NOT NULL), `budget_blocked_count` (INTEGER, NOT NULL)
- [ ] Unique constraint on `(date, provider, model, operation, domain)` in `ai_inference_daily` to prevent duplicate aggregations
- [ ] A BullMQ repeatable job (`ai-log-retention`) runs daily at 04:00 UTC and performs the following steps in order: (1) identify `ai_inference_log` rows with `created_at` older than the retention period; (2) aggregate those rows into `ai_inference_daily` — one summary row per unique `(date, provider, model, operation, domain)` combination, summing tokens, cost, and call counts, averaging latency, and counting errors, timeouts, cache hits, and budget blocks; (3) upsert into `ai_inference_daily` (if a row for the same key already exists, add to its totals); (4) delete the aged-out rows from `ai_inference_log`
- [ ] Each batch's aggregation and deletion run inside their own transaction — if a batch fails, only that batch is rolled back and the next job run reprocesses it
- [ ] The retention job logs (via application logger) the number of rows aggregated and deleted on each run
- [ ] The dashboard history endpoints (US-05 `getHistory`) seamlessly union data from `ai_inference_log` (recent data) and `ai_inference_daily` (historical data) so users see a continuous timeline regardless of retention boundaries
- [ ] The retention job processes rows in batches (e.g., 10,000 rows per batch) to avoid long-running transactions and excessive memory usage
- [ ] Unit test: insert 50 inference log rows with `created_at` set to 91+ days ago (beyond default retention), run the retention job, verify: (a) all 50 rows are deleted from `ai_inference_log`; (b) corresponding aggregate rows exist in `ai_inference_daily` with correct sums; (c) a second run of the job with no aged-out rows results in zero deletions
- [ ] Unit test: insert rows for the same `(date, provider, model, operation, domain)` key that already has an `ai_inference_daily` row, run the retention job, verify the existing aggregate row's totals are incremented (not replaced)
- [ ] Unit test: verify that rows within the retention window are untouched by the retention job

## Notes

- The `ai_inference_daily` table is append-mostly — rows are only written by the retention job. The dashboard reads from it for historical data.
- SQLite INTEGER is 8 bytes (equivalent to bigint), so token columns in the daily table can handle aggregated totals over many days without overflow.
- The batch size (10,000) is a sensible default but could be made configurable. The job should loop until all aged-out rows are processed.
- Each batch wraps its aggregation + deletion in a single transaction: if deletion succeeds but aggregation fails (or vice versa) within a batch, the entire batch rolls back. This prevents data loss or double-counting.
- The 04:00 UTC schedule is chosen to run after the 03:00 UTC summary job (US-05) so that the summary job always sees a complete dataset for its computations.
- For the `getHistory` union query: use `UNION ALL` with matching column shapes from both tables. When a date exists in both tables (edge case during the retention boundary day), sum the values.
