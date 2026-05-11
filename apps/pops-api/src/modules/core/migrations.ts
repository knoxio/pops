/**
 * Migration tags owned by the `core` module.
 *
 * Core is the always-mounted platform module — every cross-cutting concern
 * (entities, AI usage/observability/budgets, settings, search infra,
 * service accounts) lives here. The historical baseline migration
 * `0000_naive_chameleon` is assigned to core because it predates the
 * modular registry and creates tables across every domain — slicing the
 * baseline retroactively would break every production database.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

/**
 * Ordered list of drizzle migration tags owned by core. Order matches
 * `meta/_journal.json`; the runner does a journal-driven walk so this list
 * only declares ownership, not execution order.
 */
export const coreMigrationTags: readonly string[] = [
  // Pre-modular baseline — creates entities, transactions, budgets,
  // ai_usage, home_inventory, environments, transaction_corrections, etc.
  // Cannot be sliced retroactively without breaking every prod DB.
  '0000_naive_chameleon',
  // sync_logs + home_inventory rebuild (inventory-touching but assigned
  // to core because sync_logs is the platform-level sync ledger).
  '0009_red_quasimodo',
  // sync_job_results — platform-level job ledger.
  '0010_gifted_firestar',
  // budgets unique (category, period) index — finance-touching but ships
  // alongside the baseline budgets table in core's history.
  '0030_budgets_unique_category_period',
  // ai_usage → ai_inference_log rename + observability columns + providers
  // + budgets seed. AI observability is core.
  '0034_ai_observability',
  // ai_inference_log: drop legacy columns.
  '0035_ai_inference_log_drop_legacy_columns',
  // user_settings (PRD-094 US-05).
  '0043_user_settings',
  // ai_inference_log safety re-creation.
  '0045_ai_inference_log',
  // claude-sonnet-4-6 pricing seed (#2440).
  '0049_sonnet_4_6_model_pricing',
  // ai.model setting alias migration (#2463).
  '0050_ai_model_setting_alias',
  // ai_inference_daily rollup.
  '0053_ai_inference_daily',
  // service_accounts (PRD-095).
  '0054_service_accounts',
  // ai_alert_rules + ai_alerts (PRD-092 US-07).
  '0055_ai_alert_rules',
];

export const coreMigrations: readonly MigrationDescriptor[] = drizzleMigrations(coreMigrationTags);
