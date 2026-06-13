/**
 * Boot-time backfill tests for `backfillCoreFromShared` (PRD-186 PR4).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * core pillar's `core.db` against on-disk SQLite files (in-memory DBs
 * can't be ATTACHed). The set covered by this bridge is
 * `ai_model_pricing`, `sync_job_results`, `ai_usage`, `ai_alert_rules`,
 * `ai_alerts`, and `ai_providers` — the writer cutover that lets us
 * retire each entry happens once the handler flip lands; until then
 * this bridge runs on every boot. Confirms:
 *   - first run carries existing rows across for all tables,
 *   - second run is a no-op (idempotent — the per-table NOT EXISTS dedupes),
 *   - composite-key dedup honours (provider_id, model_id) for ai_model_pricing,
 *   - ai_alerts.rule_id FK survives the ATTACH copy,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb } from '@pops/core-db';

import { backfillCoreFromShared } from './backfill-core-from-shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-backfill-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const AI_MODEL_PRICING_SQL = `
CREATE TABLE ai_model_pricing (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  provider_id text NOT NULL,
  model_id text NOT NULL,
  display_name text,
  input_cost_per_mtok real DEFAULT 0 NOT NULL,
  output_cost_per_mtok real DEFAULT 0 NOT NULL,
  context_window integer,
  is_default integer DEFAULT 0 NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE UNIQUE INDEX uq_ai_model_pricing_provider_model ON ai_model_pricing (provider_id, model_id);
`;

const SYNC_JOB_RESULTS_SQL = `
CREATE TABLE sync_job_results (
  id text PRIMARY KEY NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL,
  started_at text NOT NULL,
  completed_at text,
  duration_ms integer,
  progress text,
  result text,
  error text,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX idx_sync_job_results_type_completed ON sync_job_results (job_type, completed_at);
`;

const AI_USAGE_SQL = `
CREATE TABLE ai_usage (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  description text NOT NULL,
  entity_name text,
  category text,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  cost_usd real NOT NULL,
  cached integer DEFAULT 0 NOT NULL,
  import_batch_id text,
  created_at text NOT NULL
);
CREATE INDEX idx_ai_usage_created_at ON ai_usage (created_at);
CREATE INDEX idx_ai_usage_batch ON ai_usage (import_batch_id);
`;

const AI_ALERT_RULES_SQL = `
CREATE TABLE ai_alert_rules (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  type text NOT NULL,
  scope_provider text,
  scope_model text,
  threshold_value real NOT NULL,
  window_minutes integer,
  enabled integer DEFAULT 1 NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX idx_ai_alert_rules_type ON ai_alert_rules (type);
CREATE INDEX idx_ai_alert_rules_enabled ON ai_alert_rules (enabled);
`;

const AI_PROVIDERS_SQL = `
CREATE TABLE ai_providers (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  base_url text,
  api_key_ref text,
  status text DEFAULT 'active' NOT NULL,
  last_health_check text,
  last_latency_ms integer,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX idx_ai_providers_type ON ai_providers (type);
CREATE INDEX idx_ai_providers_status ON ai_providers (status);
`;

const AI_ALERTS_SQL = `
CREATE TABLE ai_alerts (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  rule_id integer REFERENCES ai_alert_rules(id) ON DELETE SET NULL,
  type text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL,
  scope_detail text,
  metric_value real NOT NULL,
  threshold_value real NOT NULL,
  acknowledged integer DEFAULT 0 NOT NULL,
  acknowledged_at text,
  created_at text NOT NULL
);
CREATE INDEX idx_ai_alerts_created_at ON ai_alerts (created_at);
CREATE INDEX idx_ai_alerts_type ON ai_alerts (type);
CREATE INDEX idx_ai_alerts_severity ON ai_alerts (severity);
CREATE INDEX idx_ai_alerts_acknowledged ON ai_alerts (acknowledged);
CREATE INDEX idx_ai_alerts_dedupe ON ai_alerts (type, scope_detail, created_at);
`;

const USER_SETTINGS_SQL = `
CREATE TABLE user_settings (
  user_email text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (user_email, key)
);
CREATE INDEX idx_user_settings_user ON user_settings (user_email);
`;

function openSharedWithSeed(seed: (raw: BetterSqlite3.Database) => void): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(AI_MODEL_PRICING_SQL);
  raw.exec(SYNC_JOB_RESULTS_SQL);
  raw.exec(AI_USAGE_SQL);
  raw.exec(AI_ALERT_RULES_SQL);
  raw.exec(AI_ALERTS_SQL);
  raw.exec(AI_PROVIDERS_SQL);
  raw.exec(USER_SETTINGS_SQL);
  seed(raw);
  raw.close();
  return path;
}

function insertProvider(raw: BetterSqlite3.Database, id: string, type: string): void {
  raw
    .prepare(
      `INSERT INTO ai_providers
        (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, 'active', datetime('now'), datetime('now'))`
    )
    .run(id, `${id} provider`, type);
}

function insertPricing(raw: BetterSqlite3.Database, providerId: string, modelId: string): void {
  raw
    .prepare(
      `INSERT INTO ai_model_pricing
        (provider_id, model_id, display_name, input_cost_per_mtok, output_cost_per_mtok, context_window, is_default, created_at, updated_at)
       VALUES (?, ?, ?, 1.0, 5.0, 200000, 0, datetime('now'), datetime('now'))`
    )
    .run(providerId, modelId, `${providerId}/${modelId}`);
}

function insertSync(raw: BetterSqlite3.Database, id: string): void {
  raw
    .prepare(
      `INSERT INTO sync_job_results
        (id, job_type, status, started_at)
       VALUES (?, 'plex_sync', 'completed', datetime('now'))`
    )
    .run(id);
}

function insertUsage(raw: BetterSqlite3.Database, description: string): void {
  raw
    .prepare(
      `INSERT INTO ai_usage
        (description, input_tokens, output_tokens, cost_usd, created_at)
       VALUES (?, 100, 50, 0.001, datetime('now'))`
    )
    .run(description);
}

function insertAlertRule(raw: BetterSqlite3.Database, type: string): number {
  const row = raw
    .prepare(
      `INSERT INTO ai_alert_rules
        (type, scope_provider, scope_model, threshold_value, window_minutes, enabled, created_at, updated_at)
       VALUES (?, NULL, NULL, 80, 60, 1, datetime('now'), datetime('now'))
       RETURNING id`
    )
    .get(type) as { id: number };
  return row.id;
}

function insertAlert(raw: BetterSqlite3.Database, ruleId: number, type: string): void {
  raw
    .prepare(
      `INSERT INTO ai_alerts
        (rule_id, type, message, severity, scope_detail, metric_value, threshold_value, acknowledged, created_at)
       VALUES (?, ?, ?, 'warning', ?, 81, 80, 0, datetime('now'))`
    )
    .run(ruleId, type, `${type} fired`, `scope:${type}`);
}

function insertUserSetting(
  raw: BetterSqlite3.Database,
  userEmail: string,
  key: string,
  value: string
): void {
  raw
    .prepare(`INSERT INTO user_settings (user_email, key, value) VALUES (?, ?, ?)`)
    .run(userEmail, key, value);
}

describe('backfillCoreFromShared', () => {
  it('copies ai_model_pricing, sync_job_results, ai_usage, ai_alert_rules, ai_alerts, ai_providers, and user_settings rows from shared on first run', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertPricing(raw, 'claude', 'claude-haiku-4-5');
      insertSync(raw, 'job-a');
      insertUsage(raw, 'seed-usage');
      const ruleId = insertAlertRule(raw, 'budget-threshold');
      insertAlert(raw, ruleId, 'budget-threshold');
      insertProvider(raw, 'claude', 'cloud');
      insertUserSetting(raw, 'alice@example.com', 'feature.test.simple', 'true');
    });

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      backfillCoreFromShared(core, sharedPath);

      const pricing = core.raw
        .prepare('SELECT provider_id, model_id FROM ai_model_pricing')
        .all() as { provider_id: string; model_id: string }[];
      expect(pricing).toEqual([{ provider_id: 'claude', model_id: 'claude-haiku-4-5' }]);

      const sync = core.raw.prepare('SELECT id, status FROM sync_job_results').all() as {
        id: string;
        status: string;
      }[];
      expect(sync).toEqual([{ id: 'job-a', status: 'completed' }]);

      const usage = core.raw.prepare('SELECT description, input_tokens FROM ai_usage').all() as {
        description: string;
        input_tokens: number;
      }[];
      expect(usage).toEqual([{ description: 'seed-usage', input_tokens: 100 }]);

      const rules = core.raw
        .prepare('SELECT id, type, threshold_value FROM ai_alert_rules')
        .all() as { id: number; type: string; threshold_value: number }[];
      expect(rules).toEqual([{ id: 1, type: 'budget-threshold', threshold_value: 80 }]);

      const alerts = core.raw
        .prepare('SELECT rule_id, type, scope_detail, metric_value FROM ai_alerts')
        .all() as {
        rule_id: number;
        type: string;
        scope_detail: string;
        metric_value: number;
      }[];
      expect(alerts).toEqual([
        {
          rule_id: 1,
          type: 'budget-threshold',
          scope_detail: 'scope:budget-threshold',
          metric_value: 81,
        },
      ]);

      const providers = core.raw
        .prepare('SELECT id, name, type, status FROM ai_providers')
        .all() as { id: string; name: string; type: string; status: string }[];
      expect(providers).toEqual([
        { id: 'claude', name: 'claude provider', type: 'cloud', status: 'active' },
      ]);

      const userSettingsRows = core.raw
        .prepare('SELECT user_email, key, value FROM user_settings')
        .all() as { user_email: string; key: string; value: string }[];
      expect(userSettingsRows).toEqual([
        { user_email: 'alice@example.com', key: 'feature.test.simple', value: 'true' },
      ]);
    } finally {
      core.raw.close();
    }
  });

  it('is idempotent — a second run does not duplicate rows', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertPricing(raw, 'claude', 'claude-haiku-4-5');
      insertSync(raw, 'job-a');
      insertUsage(raw, 'seed-usage');
      const ruleId = insertAlertRule(raw, 'budget-threshold');
      insertAlert(raw, ruleId, 'budget-threshold');
      insertProvider(raw, 'claude', 'cloud');
      insertUserSetting(raw, 'alice@example.com', 'feature.test.simple', 'true');
    });

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      backfillCoreFromShared(core, sharedPath);
      backfillCoreFromShared(core, sharedPath);

      const pricingCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_model_pricing').get() as { n: number }
      ).n;
      const syncCount = (
        core.raw.prepare('SELECT count(*) AS n FROM sync_job_results').get() as { n: number }
      ).n;
      const usageCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_usage').get() as { n: number }
      ).n;
      const ruleCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_alert_rules').get() as { n: number }
      ).n;
      const alertCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_alerts').get() as { n: number }
      ).n;
      const providerCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_providers').get() as { n: number }
      ).n;
      const userSettingsCount = (
        core.raw.prepare('SELECT count(*) AS n FROM user_settings').get() as { n: number }
      ).n;
      expect(pricingCount).toBe(1);
      expect(syncCount).toBe(1);
      expect(usageCount).toBe(1);
      expect(ruleCount).toBe(1);
      expect(alertCount).toBe(1);
      expect(providerCount).toBe(1);
      expect(userSettingsCount).toBe(1);
    } finally {
      core.raw.close();
    }
  });

  it('skips ai_providers rows whose id already exists in core', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertProvider(raw, 'claude', 'cloud');
      insertProvider(raw, 'ollama', 'local');
    });

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      core.raw
        .prepare(
          `INSERT INTO ai_providers
            (id, name, type, base_url, api_key_ref, status, created_at, updated_at)
           VALUES ('claude', 'Core overrides shared', 'cloud', NULL, NULL, 'active', datetime('now'), datetime('now'))`
        )
        .run();

      backfillCoreFromShared(core, sharedPath);

      const rows = core.raw.prepare('SELECT id, name FROM ai_providers ORDER BY id').all() as {
        id: string;
        name: string;
      }[];
      expect(rows).toEqual([
        { id: 'claude', name: 'Core overrides shared' },
        { id: 'ollama', name: 'ollama provider' },
      ]);
    } finally {
      core.raw.close();
    }
  });

  it('preserves ai_alerts.rule_id FK to ai_alert_rules.id across the ATTACH copy', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      const errorSpikeRuleId = insertAlertRule(raw, 'error-spike');
      const latencyRuleId = insertAlertRule(raw, 'latency-degradation');
      insertAlert(raw, latencyRuleId, 'latency-degradation');
      insertAlert(raw, errorSpikeRuleId, 'error-spike');
    });

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      backfillCoreFromShared(core, sharedPath);

      const joined = core.raw
        .prepare(
          `SELECT a.type AS alert_type, r.type AS rule_type
             FROM ai_alerts a
             JOIN ai_alert_rules r ON r.id = a.rule_id
             ORDER BY a.type`
        )
        .all() as { alert_type: string; rule_type: string }[];
      expect(joined).toEqual([
        { alert_type: 'error-spike', rule_type: 'error-spike' },
        { alert_type: 'latency-degradation', rule_type: 'latency-degradation' },
      ]);
    } finally {
      core.raw.close();
    }
  });

  it('skips ai_model_pricing rows whose (provider_id, model_id) already exists in core', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertPricing(raw, 'claude', 'claude-sonnet-4-6');
      insertPricing(raw, 'claude', 'claude-opus-4');
    });

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      core.raw
        .prepare(
          `INSERT INTO ai_model_pricing
            (provider_id, model_id, display_name, input_cost_per_mtok, output_cost_per_mtok, context_window, is_default, created_at, updated_at)
           VALUES ('claude', 'claude-sonnet-4-6', 'Core overrides shared', 3.0, 15.0, 200000, 0, datetime('now'), datetime('now'))`
        )
        .run();

      backfillCoreFromShared(core, sharedPath);

      const rows = core.raw
        .prepare(
          'SELECT provider_id, model_id, display_name FROM ai_model_pricing ORDER BY model_id'
        )
        .all() as { provider_id: string; model_id: string; display_name: string }[];
      expect(rows).toEqual([
        { provider_id: 'claude', model_id: 'claude-opus-4', display_name: 'claude/claude-opus-4' },
        {
          provider_id: 'claude',
          model_id: 'claude-sonnet-4-6',
          display_name: 'Core overrides shared',
        },
      ]);
    } finally {
      core.raw.close();
    }
  });

  it('tolerates a shared DB without the PR4 tables', () => {
    const sharedPath = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(sharedPath);
    raw.exec(`CREATE TABLE other_table (id integer PRIMARY KEY)`);
    raw.close();

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      expect(() => backfillCoreFromShared(core, sharedPath)).not.toThrow();
      const pricingCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_model_pricing').get() as { n: number }
      ).n;
      const syncCount = (
        core.raw.prepare('SELECT count(*) AS n FROM sync_job_results').get() as { n: number }
      ).n;
      const usageCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_usage').get() as { n: number }
      ).n;
      const ruleCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_alert_rules').get() as { n: number }
      ).n;
      const alertCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_alerts').get() as { n: number }
      ).n;
      const providerCount = (
        core.raw.prepare('SELECT count(*) AS n FROM ai_providers').get() as { n: number }
      ).n;
      const userSettingsCount = (
        core.raw.prepare('SELECT count(*) AS n FROM user_settings').get() as { n: number }
      ).n;
      expect(pricingCount).toBe(0);
      expect(syncCount).toBe(0);
      expect(usageCount).toBe(0);
      expect(ruleCount).toBe(0);
      expect(alertCount).toBe(0);
      expect(providerCount).toBe(0);
      expect(userSettingsCount).toBe(0);
    } finally {
      core.raw.close();
    }
  });

  it('skips user_settings rows whose (user_email, key) already exists in core', () => {
    const sharedPath = openSharedWithSeed((raw) => {
      insertUserSetting(raw, 'alice@example.com', 'feature.test.simple', 'true');
      insertUserSetting(raw, 'bob@example.com', 'feature.test.simple', 'false');
    });

    const core = openCoreDb(join(tmpDir, 'core.db'));
    try {
      core.raw
        .prepare(
          `INSERT INTO user_settings (user_email, key, value)
           VALUES ('alice@example.com', 'feature.test.simple', 'core-overrides-shared')`
        )
        .run();

      backfillCoreFromShared(core, sharedPath);

      const rows = core.raw
        .prepare('SELECT user_email, key, value FROM user_settings ORDER BY user_email')
        .all() as { user_email: string; key: string; value: string }[];
      expect(rows).toEqual([
        {
          user_email: 'alice@example.com',
          key: 'feature.test.simple',
          value: 'core-overrides-shared',
        },
        { user_email: 'bob@example.com', key: 'feature.test.simple', value: 'false' },
      ]);
    } finally {
      core.raw.close();
    }
  });
});
