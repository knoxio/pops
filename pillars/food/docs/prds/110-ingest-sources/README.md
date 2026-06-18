# PRD-110: Ingest Source & Media Layout

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the `ingest_sources` table — provenance for every recipe that came in via the multimodal ingestion pipeline (URL, Instagram reel, screenshot, text). Define the on-disk layout for the source media (video, transcript, keyframes, raw caption) and the FIFO retention policy that caps disk usage at ~5 GB / 100 ingests. Define the Litestream exclusion so the regeneratable media doesn't bloat backups.

This PRD covers schema, filesystem layout, and config. The actual ingestion pipeline (BullMQ producer, yt-dlp worker, faster-whisper, Claude vision) is Epic 02. PRD-110 specifies what those processes write into; it doesn't define how they run.

## Data Model

### `ingest_sources`

```sql
CREATE TABLE ingest_sources (
  id                INTEGER PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('url-web','url-instagram','text','screenshot')),
  url               TEXT,                          -- the source URL for url-* kinds
  caption           TEXT,                          -- raw caption / textual source
  transcript_path   TEXT,                          -- path to .vtt relative to FOOD_INGEST_DIR
  keyframes_dir     TEXT,                          -- path to keyframes directory relative to FOOD_INGEST_DIR
  video_path        TEXT,                          -- path to the source video relative to FOOD_INGEST_DIR
  extracted_json    TEXT,                          -- the LLM's structured output that became the draft
  extractor_version TEXT NOT NULL,                 -- pipeline + model version snapshot
  draft_recipe_id   INTEGER REFERENCES recipes(id),
  ingested_at       TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at       TEXT                            -- set when media is evicted by FIFO; row persists
);
CREATE INDEX idx_ingest_sources_kind     ON ingest_sources(kind);
CREATE INDEX idx_ingest_sources_recipe   ON ingest_sources(draft_recipe_id);
CREATE INDEX idx_ingest_sources_ingested ON ingest_sources(ingested_at);
```

One row per ingest invocation, regardless of outcome. Even if the LLM extraction fails or the user rejects the draft, the row persists for audit (and to power the IG-auth-dead detection in Epic 02).

`extractor_version` is a short string like `"pipeline-v1.2;faster-whisper-distil-large-v3;claude-haiku-4-5-20251001"` capturing what produced this result. Lets a future re-extraction compare against the original.

`draft_recipe_id` is set when the extraction successfully created a draft `recipe_versions` row (via PRD-107's service). Null if extraction failed.

`archived_at` is set when the FIFO eviction process removes this source's media files; the row stays so the link to the recipe persists. After archive, `transcript_path`, `keyframes_dir`, and `video_path` are still populated but the files are gone.

## Filesystem Layout

All ingest media lives under `${FOOD_INGEST_DIR}` (default: `./data/food/ingest/`), one subdirectory per `ingest_sources.id`:

```
${FOOD_INGEST_DIR}/
  <source_id>/
    video.mp4              # Instagram only; absent for url-web / text / screenshot
    caption.txt            # raw caption (Instagram) or pasted text (text kind)
    screenshot.png         # screenshot kind only
    transcript.vtt         # only when faster-whisper ran (Instagram with non-structured caption)
    keyframes/
      000.jpg
      001.jpg
      ...                  # ≤10 frames from ffmpeg scene detection
    extracted.json         # the LLM extraction output that became the draft
    meta.json              # { extractor_version, timings_ms, costs_usd, model_calls }
```

Path columns in `ingest_sources` store relative paths from `FOOD_INGEST_DIR` (e.g. `42/video.mp4`). Absolute paths are computed at read time from `FOOD_INGEST_DIR` + the relative path.

## Retention Policy

A periodic job (cron-style, lives in Epic 02's worker config) walks `${FOOD_INGEST_DIR}/*/` and, when count > 100, deletes oldest by directory mtime until ≤100 remain. For each deleted directory:

1. Delete the directory recursively.
2. UPDATE `ingest_sources SET archived_at = datetime('now') WHERE id = <evicted_id>`.

The row itself is never deleted. Recipes that originated from evicted sources still have `source_id` set; the UI shows "source media archived" instead of links.

5 GB is a soft target — based on an average Instagram reel being ~20-50 MB plus a few hundred KB of derivatives. Hard enforcement is by count (100), not bytes; if bytes blow past the target, the count cap needs lowering. Out of scope for v1 to dynamically adjust.

## Litestream Exclusion

`FOOD_INGEST_DIR` and `MEDIA_IMAGES_DIR` (the existing pattern) are excluded from Litestream replication. Litestream config (in `infra/`) gets an explicit exclude path. Rationale: media is regeneratable from the source (re-ingest produces equivalent files) and exceeds reasonable backup volume.

The `ingest_sources` TABLE remains in SQLite and IS backed up via Litestream — the row pointing at archived media is preserved; the bytes themselves are not.

## Configuration

Add to `apps/pops-api/.env.example`:

```
# Food ingest media directory. Holds yt-dlp video + transcript + keyframes per ingest.
# Capped at 100 directories (~5 GB target). NOT backed up by Litestream.
FOOD_INGEST_DIR=./data/food/ingest
```

Default value should also be hard-coded in the env-loading module so missing config doesn't crash.

## Business Rules

- `extractor_version` is REQUIRED. Even manual-text ingests (`kind='text'`) record what extractor processed the body so the audit trail is complete.
- `draft_recipe_id` is set exactly once. If extraction succeeds → set the FK. If the user later rejects the draft, the FK stays (the recipe row's `archived_at` reflects rejection; ingest_sources stays linked).
- `url` is required for `kind ∈ {url-web, url-instagram}`; null for `text` and `screenshot`. Enforced at service layer.
- `caption` is the canonical text input: for `kind=text` it's the user's pasted body; for `kind=url-instagram` it's the IG caption; for `kind=screenshot` it may carry OCR'd text (or stay null). For `kind=url-web` it may carry the readability-extracted body.
- Path columns are stored as relative paths from `FOOD_INGEST_DIR`. Code that reads them computes the absolute path each time — env-driven, not stored absolute.
- Eviction sets `archived_at` but does NOT clear path columns. The path values become "historical" — they describe where the files used to be.
- Concurrent ingest writes to different `<source_id>/` subdirectories are isolated; no locking needed beyond standard filesystem semantics.

## Edge Cases

| Case                                                            | Behaviour                                                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Ingest job crashes mid-write (partial files in `<source_id>/`)  | Worker is responsible for atomic completion (tmpdir + rename). Partial state cleaned by retention job's mtime walk.                 |
| Eviction job runs while another ingest is writing               | Eviction skips directories newer than 60 seconds; new ingests are safe.                                                             |
| FOOD_INGEST_DIR unset                                           | Defaults to `./data/food/ingest`; created on first ingest if missing.                                                               |
| Disk full mid-ingest                                            | Worker catches ENOSPC, marks the ingest as failed (in worker state, not in DB). Eviction job may free space on next tick.           |
| `kind='screenshot'` with both `screenshot.png` and a transcript | Allowed (a screenshot with embedded video frame). Schema is permissive; UI shows whichever paths exist.                             |
| `kind='url-web'` with no `caption` and no `extracted_json`      | Indicates parse failure. Row persists for audit; UI surfaces failure status (Epic 03).                                              |
| Re-ingest of the same URL                                       | New `ingest_sources` row; no dedup. Future Epic 02 PRD may add dedup logic.                                                         |
| Source URL contains tracking parameters                         | Stored as-is. Normalisation deferred (could break re-ingest dedup later).                                                           |
| Manual delete of `<source_id>/` directory by an operator        | Next eviction tick is a no-op for that ID. `archived_at` is not set automatically — out-of-band cleanup is operator responsibility. |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Migration adds `ingest_sources` per the SQL above.
- [x] Drizzle schema and `packages/db-types` regenerated.
- [x] Indexes verified via PRAGMA.

### Configuration

- [x] `FOOD_INGEST_DIR` added to `apps/pops-api/.env.example` with the default and the "not backed up" comment.
- [x] Env loader has a hard-coded default (`./data/food/ingest`) so the API starts without the var set.

### Filesystem helpers

- [x] `packages/app-food/src/storage/ingest-paths.ts` exports `ingestDirFor(sourceId): string` returning the absolute path.
- [x] `packages/app-food/src/storage/ingest-paths.ts` exports `relativeToIngestDir(absolutePath): string` for storing path columns.

### Retention job

- [x] `packages/app-food/src/jobs/ingest-eviction.ts` exports `runEvictionTick(db, dir): Promise<EvictionResult>` that prunes oldest-mtime subdirectories beyond 100.
- [x] Each eviction sets `archived_at` in `ingest_sources` for the corresponding ID.
- [x] Tick skips directories newer than 60 seconds (avoids racing with in-flight ingests).
- [x] Vitest test seeds 105 fake source directories, runs the tick, asserts 5 oldest are gone and 5 `ingest_sources` rows have `archived_at` populated.

### Litestream

- [x] The Litestream-exclusion expectation for `${FOOD_INGEST_DIR}` is documented in this repo (AGENTS.md under Tech Stack + comment on the `.env.example` entry), so the operator landing the homelab-infra YAML change has the required context.
- [ ] The Litestream YAML in the private `homelab-infra` repo is updated to exclude `${FOOD_INGEST_DIR}`. Tracked as a follow-up outside this repo; this PR cannot tick it.

### Invariants

- [x] Inserting `kind='url-web'` with `url IS NULL` is rejected by the service (not DB CHECK — `url` is nullable for `kind='text'`).
- [x] Inserting with an unknown `kind` value fails the CHECK.
- [x] `extractor_version` NOT NULL enforced.

## Out of Scope

- The ingestion pipeline itself (yt-dlp, faster-whisper, Claude vision, BullMQ queue) — Epic 02 PRDs.
- IG cookie management / refresh runbook — Epic 02.
- The review queue UI that promotes drafts to canonical — Epic 03.
- Storage backend abstraction (local vs S3 vs R2) — local only for v1.
- Per-byte disk monitoring; v1 enforces by directory count only.
- Cross-ingest dedup ("we've already ingested this URL") — deferred.
- URL normalisation / canonicalisation — deferred.
