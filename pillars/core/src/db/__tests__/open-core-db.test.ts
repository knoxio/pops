/**
 * Smoke tests for the standalone `openCoreDb` helper.
 *
 * Exercises the migration apply path against a fresh tmp file, verifies
 * the resulting schema, and confirms the helper is idempotent when
 * re-run against the same DB.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb } from '../open-core-db.js';
import { countActiveServiceAccounts, createServiceAccount } from '../services/service-accounts.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-db-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openCoreDb', () => {
  it('creates the parent directory and opens a fresh DB', () => {
    const path = join(tmpDir, 'nested', 'sub', 'core.db');
    expect(existsSync(path)).toBe(false);

    const { raw } = openCoreDb(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(raw.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      raw.close();
    }
  });

  it('applies the service_accounts migration', () => {
    const path = join(tmpDir, 'core.db');
    const { db, raw } = openCoreDb(path);
    try {
      // Table exists + accepts inserts via the package service.
      expect(countActiveServiceAccounts(db)).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('applies the PRD-186 PR4 ai_model_pricing, sync_job_results, and ai_usage migrations', () => {
    const path = join(tmpDir, 'core.db');
    const { raw } = openCoreDb(path);
    try {
      const tables = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(tables.has('ai_model_pricing')).toBe(true);
      expect(tables.has('sync_job_results')).toBe(true);
      expect(tables.has('ai_usage')).toBe(true);

      const indexes = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(indexes.has('uq_ai_model_pricing_provider_model')).toBe(true);
      expect(indexes.has('idx_sync_job_results_type_completed')).toBe(true);
      expect(indexes.has('idx_ai_usage_created_at')).toBe(true);
      expect(indexes.has('idx_ai_usage_batch')).toBe(true);
    } finally {
      raw.close();
    }
  });

  it('applies the PRD-186 PR4 ai_alert_rules + ai_alerts migrations', () => {
    const path = join(tmpDir, 'core.db');
    const { raw } = openCoreDb(path);
    try {
      const tables = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(tables.has('ai_alert_rules')).toBe(true);
      expect(tables.has('ai_alerts')).toBe(true);

      const indexes = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(indexes.has('idx_ai_alert_rules_type')).toBe(true);
      expect(indexes.has('idx_ai_alert_rules_enabled')).toBe(true);
      expect(indexes.has('idx_ai_alerts_created_at')).toBe(true);
      expect(indexes.has('idx_ai_alerts_type')).toBe(true);
      expect(indexes.has('idx_ai_alerts_severity')).toBe(true);
      expect(indexes.has('idx_ai_alerts_acknowledged')).toBe(true);
      expect(indexes.has('idx_ai_alerts_dedupe')).toBe(true);

      const ruleId = (
        raw
          .prepare(
            `INSERT INTO ai_alert_rules
              (type, scope_provider, scope_model, threshold_value, window_minutes, enabled, created_at, updated_at)
             VALUES ('budget-threshold', NULL, NULL, 80, NULL, 1, datetime('now'), datetime('now'))
             RETURNING id`
          )
          .get() as { id: number }
      ).id;
      raw
        .prepare(
          `INSERT INTO ai_alerts
            (rule_id, type, message, severity, scope_detail, metric_value, threshold_value, acknowledged, created_at)
           VALUES (?, 'budget-threshold', 'over budget', 'warning', 'budget:global', 81, 80, 0, datetime('now'))`
        )
        .run(ruleId);
      const count = (raw.prepare('SELECT count(*) AS n FROM ai_alerts').get() as { n: number }).n;
      expect(count).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('applies the PRD-186 PR4 ai_providers migration', () => {
    const path = join(tmpDir, 'core.db');
    const { raw } = openCoreDb(path);
    try {
      const tables = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(tables.has('ai_providers')).toBe(true);

      const indexes = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(indexes.has('idx_ai_providers_type')).toBe(true);
      expect(indexes.has('idx_ai_providers_status')).toBe(true);

      raw
        .prepare(
          `INSERT INTO ai_providers
            (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
           VALUES ('claude', 'Anthropic Claude', 'cloud', NULL, 'anthropic.apiKey', 'active', datetime('now'), datetime('now'))`
        )
        .run();
      const count = (raw.prepare('SELECT count(*) AS n FROM ai_providers').get() as { n: number })
        .n;
      expect(count).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('applies the PRD-186 PR4 user_settings migration', () => {
    const path = join(tmpDir, 'core.db');
    const { raw } = openCoreDb(path);
    try {
      const tables = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(tables.has('user_settings')).toBe(true);

      const indexes = new Set(
        (
          raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
            name: string;
          }[]
        ).map((r) => r.name)
      );
      expect(indexes.has('idx_user_settings_user')).toBe(true);

      raw
        .prepare(
          `INSERT INTO user_settings (user_email, key, value)
           VALUES ('alice@example.com', 'feature.test.simple', 'true')`
        )
        .run();
      const count = (raw.prepare('SELECT count(*) AS n FROM user_settings').get() as { n: number })
        .n;
      expect(count).toBe(1);
    } finally {
      raw.close();
    }
  });

  it('is idempotent — re-opening the same DB does not re-apply migrations', async () => {
    const path = join(tmpDir, 'core.db');
    const first = openCoreDb(path);
    try {
      await createServiceAccount(first.db, { name: 'persists', scopes: ['x'] }, null);
      expect(countActiveServiceAccounts(first.db)).toBe(1);
    } finally {
      first.raw.close();
    }

    const second = openCoreDb(path);
    try {
      expect(countActiveServiceAccounts(second.db)).toBe(1);
    } finally {
      second.raw.close();
    }
  });
});
