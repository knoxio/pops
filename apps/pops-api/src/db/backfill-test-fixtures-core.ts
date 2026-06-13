/**
 * SQL fixtures for the core-pillar backfill suite. Split out of
 * `backfill-test-fixtures.ts` to keep each file under the 200-line cap.
 * See that module's header for why these DDLs live alongside the tests.
 *
 * Theme 13 round 2 retired the `service_accounts`, `settings`,
 * `ai_inference_daily`, and `ai_budgets` fixtures alongside their
 * `TABLE_COPIES` entries — only `ai_inference_log` is still bridged.
 */
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
