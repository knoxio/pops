/**
 * One-shot deploy step: migrate core's `ai_usage` rows into the finance pillar
 * (gap #3489). The finance-categorizer `ai_usage` table re-homed from core to
 * finance; this copies the historical rows across so usage history survives the
 * cutover. Idempotent — safe to re-run: rows already present in finance (matched
 * on their natural content key) are skipped, so a partial run resumes cleanly.
 *
 * Does NOT run automatically; invoke explicitly BEFORE the core image that drops
 * the table rolls out (same staged-deploy ordering as the entities migration —
 * the source table must still exist when this runs):
 *
 *   CORE_SQLITE_PATH=/data/sqlite/core.db \
 *   FINANCE_SQLITE_PATH=/data/sqlite/finance.db \
 *   pnpm --filter @pops/finance exec tsx scripts/migrate-ai-usage.ts
 *
 * Exits non-zero on any hard failure so a deploy pipeline can halt.
 */
import { existsSync } from 'node:fs';

import Database from 'better-sqlite3';

import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import { openFinanceDb } from '../src/db/index.js';

const DEFAULT_CORE_SQLITE_PATH = './data/core.db';

interface AiUsageRow {
  description: string;
  entity_name: string | null;
  category: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  cached: number;
  import_batch_id: string | null;
  created_at: string;
}

function resolveCoreSqlitePath(): string {
  return process.env['CORE_SQLITE_PATH'] ?? DEFAULT_CORE_SQLITE_PATH;
}

function readCoreRows(corePath: string): AiUsageRow[] {
  const raw = new Database(corePath, { readonly: true });
  try {
    const tableExists = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_usage'")
      .get();
    if (!tableExists) return [];
    return raw
      .prepare(
        `SELECT description, entity_name, category, input_tokens, output_tokens,
                cost_usd, cached, import_batch_id, created_at
         FROM ai_usage`
      )
      .all() as AiUsageRow[];
  } finally {
    raw.close();
  }
}

interface MigrationSummary {
  total: number;
  inserted: number;
  skipped: number;
}

function copyRows(corePath: string, financePath: string): MigrationSummary {
  const rows = readCoreRows(corePath);
  const { raw } = openFinanceDb(financePath);
  try {
    const exists = raw.prepare(
      `SELECT 1 FROM ai_usage
       WHERE description = @description
         AND created_at = @created_at
         AND IFNULL(import_batch_id, '') = IFNULL(@import_batch_id, '')
       LIMIT 1`
    );
    const insert = raw.prepare(
      `INSERT INTO ai_usage
         (description, entity_name, category, input_tokens, output_tokens,
          cost_usd, cached, import_batch_id, created_at)
       VALUES
         (@description, @entity_name, @category, @input_tokens, @output_tokens,
          @cost_usd, @cached, @import_batch_id, @created_at)`
    );
    let inserted = 0;
    let skipped = 0;
    const run = raw.transaction((batch: AiUsageRow[]) => {
      for (const row of batch) {
        if (exists.get(row)) {
          skipped += 1;
          continue;
        }
        insert.run(row);
        inserted += 1;
      }
    });
    run(rows);
    return { total: rows.length, inserted, skipped };
  } finally {
    raw.close();
  }
}

function main(): void {
  const corePath = resolveCoreSqlitePath();
  const financePath = resolveFinanceSqlitePath();
  if (!existsSync(corePath)) {
    console.warn(`[migrate-ai-usage] core DB not found at ${corePath} — nothing to migrate`);
    return;
  }
  const summary = copyRows(corePath, financePath);
  console.warn(
    `[migrate-ai-usage] done — total=${summary.total} inserted=${summary.inserted} ` +
      `skipped=${summary.skipped} (core=${corePath} finance=${financePath})`
  );
}

try {
  main();
} catch (err: unknown) {
  console.error('[migrate-ai-usage] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
