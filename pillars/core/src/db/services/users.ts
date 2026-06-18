/**
 * Read-only `users` surface for PRD-251 H7 cross-pillar reconciliation.
 *
 * pops is a single-user system identified by an authenticated email
 * (Cloudflare Access or in-process dev fallback). There is no `users` table
 * — identity is the email itself, plus whatever rows happen to exist under
 * `user_settings.user_email`. That's enough to answer the only question a
 * sibling pillar's reconciliation cron asks: "does this user URI still
 * resolve?".
 *
 * The router accepts a URI (`pops://core/user/<email>`) per the PRD-251
 * cross-pillar wire contract; this service is the email-shaped layer
 * underneath. The router parses the URI and forwards the extracted email
 * here. A `null` here is treated as 404 by the consumer — it stamps the
 * consumer row's `*_stale_at` rather than deleting it (PRD-251
 * §"Existence is best-effort").
 *
 * No write surface is exposed: owning-pillar writes are forbidden by the
 * PRD-251 business rules, and the dev-fallback email resolved by the identity
 * middleware is mint-on-demand.
 */
import { eq } from 'drizzle-orm';

import { userSettings } from '../schema/user-settings.js';

import type { CoreDb } from './internal.js';

/** Public shape returned by `core.users.get`. */
export interface UserRecord {
  email: string;
}

/**
 * Return a `UserRecord` for `email` if any `user_settings` row exists for
 * that email, or `null` otherwise. The cron in `pops-inventory-api`
 * branches on `null` to stamp the consumer row stale.
 */
export function getUser(db: CoreDb, email: string): UserRecord | null {
  const row = db
    .select({ userEmail: userSettings.userEmail })
    .from(userSettings)
    .where(eq(userSettings.userEmail, email))
    .limit(1)
    .all();
  if (row.length === 0) return null;
  return { email };
}
