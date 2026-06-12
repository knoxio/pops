/**
 * SQL fixtures for the core-pillar backfill suite. Split out of
 * `backfill-test-fixtures.ts` to keep each file under the 200-line cap.
 * See that module's header for why these DDLs live alongside the tests.
 */
export const SERVICE_ACCOUNTS_TABLE_SQL = `
CREATE TABLE service_accounts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text DEFAULT '[]' NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL,
  last_used_at text,
  revoked_at text,
  created_by text
);
CREATE UNIQUE INDEX service_accounts_name_unique ON service_accounts (name);
CREATE UNIQUE INDEX service_accounts_key_prefix_unique ON service_accounts (key_prefix);
CREATE INDEX idx_service_accounts_key_prefix ON service_accounts (key_prefix);
CREATE INDEX idx_service_accounts_revoked_at ON service_accounts (revoked_at);
`;

export const SETTINGS_TABLE_SQL = `
CREATE TABLE settings (
  key text PRIMARY KEY NOT NULL,
  value text NOT NULL
);
`;

export const AI_INFERENCE_LOG_TABLE_SQL = `
CREATE TABLE ai_inference_log (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  domain text,
  input_tokens integer DEFAULT 0 NOT NULL,
  output_tokens integer DEFAULT 0 NOT NULL,
  cost_usd real DEFAULT 0 NOT NULL,
  latency_ms integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'success' NOT NULL,
  cached integer DEFAULT 0 NOT NULL,
  context_id text,
  error_message text,
  metadata text,
  created_at text NOT NULL
);
CREATE INDEX idx_ai_inference_log_created_at ON ai_inference_log (created_at);
CREATE INDEX idx_ai_inference_log_provider_model ON ai_inference_log (provider, model);
CREATE INDEX idx_ai_inference_log_operation ON ai_inference_log (operation);
CREATE INDEX idx_ai_inference_log_domain ON ai_inference_log (domain);
CREATE INDEX idx_ai_inference_log_context_id ON ai_inference_log (context_id);
CREATE INDEX idx_ai_inference_log_status ON ai_inference_log (status);
`;

export const AI_INFERENCE_DAILY_TABLE_SQL = `
CREATE TABLE ai_inference_daily (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  date text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  domain text,
  total_calls integer DEFAULT 0 NOT NULL,
  total_input_tokens integer DEFAULT 0 NOT NULL,
  total_output_tokens integer DEFAULT 0 NOT NULL,
  total_cost_usd real DEFAULT 0 NOT NULL,
  avg_latency_ms integer DEFAULT 0 NOT NULL,
  error_count integer DEFAULT 0 NOT NULL,
  timeout_count integer DEFAULT 0 NOT NULL,
  cache_hit_count integer DEFAULT 0 NOT NULL,
  budget_blocked_count integer DEFAULT 0 NOT NULL
);
CREATE UNIQUE INDEX idx_ai_inference_daily_key ON ai_inference_daily (date, provider, model, operation, domain);
CREATE INDEX idx_ai_inference_daily_date ON ai_inference_daily (date);
CREATE INDEX idx_ai_inference_daily_provider_model ON ai_inference_daily (provider, model);
`;

export const AI_BUDGETS_TABLE_SQL = `
CREATE TABLE ai_budgets (
  id text PRIMARY KEY NOT NULL,
  scope_type text NOT NULL,
  scope_value text,
  monthly_token_limit integer,
  monthly_cost_limit real,
  action text DEFAULT 'warn' NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
`;
