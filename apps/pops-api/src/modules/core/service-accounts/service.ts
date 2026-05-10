/**
 * Service-account CRUD + verification.
 *
 * Verification path is hot — every authenticated machine call hits it once.
 * It is intentionally a single indexed read on `key_prefix`, then one scrypt
 * compare. Revoked rows return null without doing the scrypt work.
 */
import { randomUUID } from 'node:crypto';

import { eq, isNull, sql } from 'drizzle-orm';

import { serviceAccounts } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { generateApiKey, verifySecret } from './key.js';

import type { CreateServiceAccountInput, CreatedServiceAccount, ServiceAccount } from './types.js';

interface ServiceAccountRow {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
}

function rowToPublic(row: ServiceAccountRow): ServiceAccount {
  let parsedScopes: string[];
  try {
    const parsed: unknown = JSON.parse(row.scopes);
    parsedScopes = Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string')
      : [];
  } catch {
    parsedScopes = [];
  }
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: parsedScopes,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdBy: row.createdBy,
  };
}

export async function createServiceAccount(
  input: CreateServiceAccountInput,
  createdBy: string | null
): Promise<CreatedServiceAccount> {
  const db = getDrizzle();
  const existing = db
    .select()
    .from(serviceAccounts)
    .where(eq(serviceAccounts.name, input.name))
    .all();
  if (existing.length > 0) {
    throw new ValidationError({
      message: `Service account '${input.name}' already exists`,
    });
  }
  const issued = await generateApiKey();
  const id = `sa_${randomUUID()}`;
  const now = new Date().toISOString();
  db.insert(serviceAccounts)
    .values({
      id,
      name: input.name,
      keyPrefix: issued.prefix,
      keyHash: issued.hash,
      scopes: JSON.stringify(input.scopes),
      createdAt: now,
      createdBy,
    })
    .run();
  return {
    id,
    name: input.name,
    keyPrefix: issued.prefix,
    scopes: input.scopes,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    createdBy,
    plaintextKey: issued.plaintext,
  };
}

export function listServiceAccounts(): ServiceAccount[] {
  const db = getDrizzle();
  const rows = db.select().from(serviceAccounts).orderBy(serviceAccounts.createdAt).all();
  return rows.map((r): ServiceAccount => rowToPublic(r));
}

export function revokeServiceAccount(id: string): void {
  const db = getDrizzle();
  const [row] = db.select().from(serviceAccounts).where(eq(serviceAccounts.id, id)).all();
  if (!row) throw new NotFoundError('ServiceAccount', id);
  if (row.revokedAt !== null) {
    throw new HttpError(409, `Service account '${id}' is already revoked`);
  }
  db.update(serviceAccounts)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(serviceAccounts.id, id))
    .run();
}

/** Result of a successful service-account authentication. */
export interface AuthenticatedServiceAccount {
  id: string;
  name: string;
  scopes: string[];
}

/**
 * Verify a presented prefix + secret against the database. Returns the
 * authenticated principal on success or null on any failure path. Updates
 * `last_used_at` opportunistically on success — failures never write.
 */
export async function authenticateServiceAccount(
  prefix: string,
  secret: string
): Promise<AuthenticatedServiceAccount | null> {
  const db = getDrizzle();
  const [row] = db
    .select()
    .from(serviceAccounts)
    .where(eq(serviceAccounts.keyPrefix, prefix))
    .all();
  if (!row || row.revokedAt !== null) return null;
  const ok = await verifySecret(secret, row.keyHash);
  if (!ok) return null;

  // Touch last_used_at — best-effort, errors non-fatal.
  try {
    db.update(serviceAccounts)
      .set({ lastUsedAt: sql`(datetime('now'))` })
      .where(eq(serviceAccounts.id, row.id))
      .run();
  } catch (err) {
    console.warn('[service-accounts] failed to touch last_used_at:', err);
  }

  const publicRow = rowToPublic(row);
  return { id: publicRow.id, name: publicRow.name, scopes: publicRow.scopes };
}

/**
 * Returns true if the procedure path falls under any of the granted scope
 * prefixes. Scopes use dot-prefix matching: a granted scope `cerebrum.ingest`
 * authorises `cerebrum.ingest.quickCapture` but not `cerebrum.query.ask`.
 */
export function hasScopeFor(grantedScopes: string[], procedurePath: string): boolean {
  for (const scope of grantedScopes) {
    if (scope === procedurePath) return true;
    if (procedurePath.startsWith(`${scope}.`)) return true;
  }
  return false;
}

/** Convenience for tests that need a quick lookup. */
export function getActiveServiceAccountByPrefix(prefix: string): ServiceAccount | null {
  const db = getDrizzle();
  const [row] = db
    .select()
    .from(serviceAccounts)
    .where(eq(serviceAccounts.keyPrefix, prefix))
    .all();
  if (!row || row.revokedAt !== null) return null;
  return rowToPublic(row);
}

/** Internal: count active accounts (used by health/admin tooling). */
export function countActiveServiceAccounts(): number {
  const db = getDrizzle();
  const rows = db.select().from(serviceAccounts).where(isNull(serviceAccounts.revokedAt)).all();
  return rows.length;
}
