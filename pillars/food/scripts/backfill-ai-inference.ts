/**
 * One-shot, idempotent backfill of food's historical `ai_inference_log` rows
 * into the ai pillar's cross-pillar telemetry store.
 *
 * Reads every row from food's local `ai_inference_log`, maps each to a
 * `@pops/ai-telemetry` `InferenceRecord` via the unit-tested
 * `foodRowToInferenceRecord`, and POSTs it to the ai pillar's internal
 * `POST /ai-usage/record` (gated by `x-pops-internal-token`).
 *
 * Deploy ordering (#3490): the table is dropped by migration
 * `0063_drop_ai_inference_log`, so this backfill MUST run BEFORE the drop
 * deploys. It opens the food SQLite with a raw `better-sqlite3` handle and a
 * raw `SELECT` — deliberately NOT `openFoodDb`, which would apply the drop
 * migration on open and erase the rows it is meant to read.
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

import Database from 'better-sqlite3';

import { resolveFoodSqlitePath } from '../src/api/food-sqlite-path.js';
import {
  type AiInferenceLogRow,
  foodRowToInferenceRecord,
} from '../src/worker/ai/backfill-mapping.js';

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
  tableDropped: boolean;
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

interface RawAiInferenceLogRow {
  id: number;
  provider: string;
  model: string;
  operation: string;
  domain: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: string;
  cached: number;
  context_id: string | null;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
}

const SELECT_ROWS = 'SELECT * FROM ai_inference_log ORDER BY id';

const TABLE_EXISTS =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_inference_log'";

function toLogRow(raw: RawAiInferenceLogRow): AiInferenceLogRow {
  return {
    id: raw.id,
    provider: raw.provider,
    model: raw.model,
    operation: raw.operation,
    domain: raw.domain,
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    costUsd: raw.cost_usd,
    latencyMs: raw.latency_ms,
    status: raw.status,
    cached: raw.cached,
    contextId: raw.context_id,
    errorMessage: raw.error_message,
    metadata: raw.metadata,
    createdAt: raw.created_at,
  };
}

function tableExists(handle: Database.Database): boolean {
  return handle.prepare(TABLE_EXISTS).get() !== undefined;
}

/**
 * Reads every legacy `ai_inference_log` row, ordered by `id` for deterministic
 * runs. Returns `null` when the table no longer exists — the expected state
 * once migration `0063_drop_ai_inference_log` has deployed — so a post-drop
 * re-run is a clean no-op instead of a raw `no such table` stack trace.
 */
function readLogRows(sqlitePath: string): AiInferenceLogRow[] | null {
  const handle = new Database(sqlitePath, { readonly: true });
  try {
    if (!tableExists(handle)) return null;
    const raw = handle.prepare(SELECT_ROWS).all() as RawAiInferenceLogRow[];
    return raw.map(toLogRow);
  } finally {
    handle.close();
  }
}

export async function runBackfill(config: BackfillConfig): Promise<BackfillSummary> {
  const rows = readLogRows(config.sqlitePath);
  if (rows === null) {
    return { total: 0, posted: 0, skipped: 0, failed: 0, tableDropped: true };
  }
  const summary: BackfillSummary = {
    total: rows.length,
    posted: 0,
    skipped: 0,
    failed: 0,
    tableDropped: false,
  };
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
  return summary;
}

async function main(): Promise<void> {
  const config = readConfig(process.argv.slice(2));
  console.warn(
    `[backfill] reading food ai_inference_log at ${config.sqlitePath}` +
      (config.dryRun ? ' (dry-run)' : ` -> ${config.aiApiUrl}${RECORD_PATH}`)
  );
  const summary = await runBackfill(config);
  if (summary.tableDropped) {
    console.warn(
      '[backfill] ai_inference_log already dropped — nothing to backfill ' +
        '(migration 0063_drop_ai_inference_log has deployed). No-op.'
    );
    return;
  }
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
