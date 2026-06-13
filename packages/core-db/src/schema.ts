/**
 * Local re-export of the core domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so that
 * the core module's read surface stays self-describing.
 *
 * Mirrors the `@pops/app-food-db` schema re-export pattern.
 */
export {
  aiAlertRules,
  aiAlerts,
  aiBudgets,
  aiInferenceDaily,
  aiInferenceLog,
  aiModelPricing,
  aiUsage,
  pillarRegistry,
  serviceAccounts,
  settings,
  syncJobResults,
} from '@pops/db-types';
