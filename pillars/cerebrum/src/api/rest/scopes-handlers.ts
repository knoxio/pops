/**
 * ts-rest handlers for `cerebrum.scopes.*`.
 *
 * Scope strings arrive as plain strings at the contract edge; each is
 * normalised + format-validated here through the scope schema so a malformed
 * scope surfaces as 400 (`ValidationError`) before any file write. `assign` /
 * `remove` mutate an engram's scope set via the {@link EngramService};
 * `reclassify` / `list` / `reconcile` / `filter` query the scope vocabulary
 * directly over the DB handle.
 */
import { initServer } from '@ts-rest/express';
import { z } from 'zod';

import { cerebrumScopesContract } from '../../contract/rest-scopes.js';
import { type CerebrumDb } from '../../db/index.js';
import { reclassifyScopes } from '../modules/engrams/reclassify.js';
import { filterByScopes } from '../modules/engrams/scope-filter.js';
import { createScopeReconciliationService } from '../modules/engrams/scope-reconciliation.js';
import {
  normaliseScope,
  scopeStringSchema,
  validateScope,
} from '../modules/engrams/scope-schema.js';
import { listScopes } from '../modules/engrams/scopes.js';
import { EngramService } from '../modules/engrams/service.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

const server: ReturnType<typeof initServer> = initServer();

const SCOPE_PREFIX_SEGMENT = /^[a-z0-9][a-z0-9-]{0,31}$/;

export interface ScopeHandlerDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
}

/** Normalise + format-validate a scope array, raising 400 on the first bad one. */
function parseScopes(scopes: string[]): string[] {
  return scopes.map((raw) => {
    const parsed = scopeStringSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError({ message: parsed.error.issues[0]?.message ?? 'invalid scope' });
    }
    return parsed.data;
  });
}

/**
 * Validate a scope *prefix* (used by reclassify): normalised, 1-6 segments,
 * each a lowercase alphanumeric/hyphen token. A prefix is laxer than a full
 * scope — a single segment is allowed.
 */
function parseScopePrefix(raw: string): string {
  const val = normaliseScope(raw);
  if (val.length === 0 || val.startsWith('.') || val.endsWith('.') || val.includes('..')) {
    throw new ValidationError({ message: 'invalid scope prefix format' });
  }
  const segs = val.split('.');
  if (segs.length > 6) {
    throw new ValidationError({ message: 'scope prefix must have at most 6 segments' });
  }
  for (const seg of segs) {
    if (!SCOPE_PREFIX_SEGMENT.test(seg)) {
      throw new ValidationError({
        message: `segment '${seg}' is invalid — must be lowercase alphanumeric/hyphens, 1-32 chars`,
      });
    }
  }
  return val;
}

const optionalPrefixSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));

export function makeScopesHandlers(
  deps: ScopeHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumScopesContract>> {
  const service = (): EngramService =>
    new EngramService({ root: deps.engramRoot, db: deps.db, templates: deps.templates });

  return server.router(cerebrumScopesContract, {
    assign: async ({ params, body }) =>
      runHttp(() => {
        const scopes = parseScopes(body.scopes);
        const svc = service();
        const { engram } = svc.read(params.engramId);
        const merged = [...new Set([...engram.scopes, ...scopes])];
        return { status: 200, body: { engram: svc.update(params.engramId, { scopes: merged }) } };
      }),
    remove: async ({ params, body }) =>
      runHttp(() => {
        const scopes = parseScopes(body.scopes);
        const svc = service();
        const { engram } = svc.read(params.engramId);
        const toRemove = new Set(scopes);
        const remaining = engram.scopes.filter((s) => !toRemove.has(s));
        if (remaining.length === 0) {
          throw new ValidationError({
            message: 'cannot remove the last scope — an engram must have at least one scope',
          });
        }
        return {
          status: 200,
          body: { engram: svc.update(params.engramId, { scopes: remaining }) },
        };
      }),
    reclassify: async ({ body }) =>
      runHttp(() => {
        const result = reclassifyScopes(deps.db, deps.engramRoot, {
          fromScope: parseScopePrefix(body.fromScope),
          toScope: parseScopePrefix(body.toScope),
          dryRun: body.dryRun,
        });
        return {
          status: 200,
          body: { count: result.affected, ids: result.engrams ?? [] },
        };
      }),
    list: async ({ query }) =>
      runHttp(() => {
        const prefix = optionalPrefixSchema.parse(query.prefix);
        const normalised = prefix === undefined ? undefined : parseScopePrefix(prefix);
        return { status: 200, body: { scopes: listScopes(deps.db, normalised) } };
      }),
    validate: async ({ body }) => {
      const result = validateScope(body.scope);
      if (result.valid) {
        return { status: 200 as const, body: { valid: true, scope: result.scope } };
      }
      return { status: 200 as const, body: { valid: false, errors: result.errors } };
    },
    reconcile: async ({ body }) =>
      runHttp(() => {
        const suggestedScopes = parseScopes(body.suggestedScopes);
        const knownScopes = listScopes(deps.db);
        const { suggestions } = createScopeReconciliationService().reconcile({
          suggestedScopes,
          knownScopes,
        });
        return { status: 200, body: { reconciled: suggestions } };
      }),
    filter: async ({ body }) =>
      runHttp(() => {
        const scopes = body.scopes.map((s) => parseScopePrefix(s));
        const { engramIds } = filterByScopes({
          scopes,
          includeSecret: body.includeSecret,
          db: deps.db,
        });
        if (engramIds.length === 0) return { status: 200, body: { engrams: [] } };
        const { engrams } = service().list({ ids: engramIds });
        return { status: 200, body: { engrams } };
      }),
  });
}
