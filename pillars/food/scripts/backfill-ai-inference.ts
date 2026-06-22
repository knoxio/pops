/**
 * One-shot, idempotent backfill of food's historical `ai_inference_log` rows
 * into the ai pillar's cross-pillar telemetry store.
 *
 * Reads every row from food's local `ai_inference_log` (the pre-migration
 * write path, kept in place — see PRD-055 / gap #3490), maps each to a
 * `@pops/ai-telemetry` `InferenceRecord` via the unit-tested
 * `foodRowToInferenceRecord`, and POSTs it to the ai pillar's internal
 * `POST /ai-usage/record` (gated by `x-pops-internal-token`).
 *
 * Idempotency: each record carries a STABLE
 * `metadata.dedupe_key = 'food:ai_inference_log:<id>'` and
 * `metadata.backfilled_from = 'food'`, so re-running this script produces
 * byte-identical records that a future de-dup pass can collapse. Re-running is
 * therefore safe (at worst it re-posts identical, dedupe-keyed rows).
 *
 * Does NOT auto-run — it executes only when invoked directly
 * (`pnpm --filter @pops/food backfill:ai-inference`). Pass `--dry-run` to map +
 * count without POSTing.
 *
 * Required env: `AI_API_URL` (e.g. http://ai-api:3008) and
 * `POPS_API_INTERNAL_TOKEN`. Reads food's DB at `FOOD_SQLITE_PATH` /
 * `SQLITE_PATH` (same resolver food-api uses).
 */
import { pathToFileURL } from 'node:url';

import { resolveFoodSqlitePath } from '../src/api/food-sqlite-path.js';
import { aiInferenceLog, openFoodDb } from '../src/db/index.js';
import { foodRowToInferenceRecord } from '../src/worker/ai/backfill-mapping.js';

import type { InferenceRecord } from '@pops/ai-telemetry';

const RECORD_PATH = '/ai-usage/record';
const POST_TIMEOUT_MS = 10_000;

interface BackfillConfig {
  aiApiUrl: string;
  token: string;
  dryRun: boolean;
  sqlitePath: string;
}

interface BackfillSummary {
  total: number;
  posted: number;
  skipped: number;
  failed: number;
}

function readConfig(argv: readonly string[]): BackfillConfig {
  const dryRun = argv.includes('--dry-run');
  const aiApiUrl = process.env['AI_API_URL'] ?? '';
  const token = process.env['POPS_API_INTERNAL_TOKEN'] ?? '';
  if (!dryRun && (aiApiUrl === '' || token === '')) {
    throw new Error(
      'backfill-ai-inference requires AI_API_URL and POPS_API_INTERNAL_TOKEN (or pass --dry-run)'
    );
  }
  return { aiApiUrl, token, dryRun, sqlitePath: resolveFoodSqlitePath() };
}

async function postRecord(config: BackfillConfig, record: InferenceRecord): Promise<void> {
  const base = config.aiApiUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}${RECORD_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pops-internal-token': config.token },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`POST ${RECORD_PATH} -> HTTP ${res.status}`);
  }
}

export async function runBackfill(config: BackfillConfig): Promise<BackfillSummary> {
  const { db, raw } = openFoodDb(config.sqlitePath);
  const summary: BackfillSummary = { total: 0, posted: 0, skipped: 0, failed: 0 };
  try {
    const rows = db.select().from(aiInferenceLog).all();
    summary.total = rows.length;
    for (const row of rows) {
      let record: InferenceRecord;
      try {
        record = foodRowToInferenceRecord(row);
      } catch (err) {
        summary.skipped += 1;
        console.warn(`[backfill] skipping unmappable row id=${row.id}: ${String(err)}`);
        continue;
      }
      if (config.dryRun) {
        summary.posted += 1;
        continue;
      }
      try {
        await postRecord(config, record);
        summary.posted += 1;
      } catch (err) {
        summary.failed += 1;
        console.error(`[backfill] failed to post row id=${row.id}: ${String(err)}`);
      }
    }
  } finally {
    raw.close();
  }
  return summary;
}

async function main(): Promise<void> {
  const config = readConfig(process.argv.slice(2));
  console.warn(
    `[backfill] reading food ai_inference_log at ${config.sqlitePath}` +
      (config.dryRun ? ' (dry-run)' : ` -> ${config.aiApiUrl}${RECORD_PATH}`)
  );
  const summary = await runBackfill(config);
  console.warn(
    `[backfill] done: total=${summary.total} posted=${summary.posted} ` +
      `skipped=${summary.skipped} failed=${summary.failed}`
  );
  if (summary.failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    console.error('[backfill] fatal:', err);
    process.exitCode = 1;
  });
}
