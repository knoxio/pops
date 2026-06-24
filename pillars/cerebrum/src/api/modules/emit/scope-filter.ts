/**
 * Scope filtering for document generation.
 * Spec: pillars/cerebrum/docs/prds/document-generation.
 *
 * Applied at retrieval time to enforce audience scope boundaries and
 * hard-block *.secret.* content. Secret content never enters the LLM
 * context window — this is a security requirement, not a convenience filter.
 */
import type { RetrievalFilters, RetrievalResult } from '../retrieval/types.js';

/**
 * Check whether a scope path contains a "secret" segment.
 * E.g. "personal.secret.therapy" -> true, "work.projects.karbon" -> false.
 */
export function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/**
 * Check whether a scope matches an audience scope prefix.
 * E.g. scope "work.projects.karbon" matches audience "work.*" or "work.projects.*".
 * An exact match (scope === audience without wildcard) also passes.
 */
export function matchesAudienceScope(scope: string, audienceScope: string): boolean {
  const prefix = audienceScope.endsWith('.*') ? audienceScope.slice(0, -2) : audienceScope;
  return scope === prefix || scope.startsWith(prefix + '.');
}

/**
 * Determine whether an engram should be included based on its scopes,
 * the audience scope filter, and the includeSecret flag.
 *
 * An engram with ANY secret scope is treated as secret (most restrictive wins).
 * When includeSecret is true with an audienceScope, only secret content within
 * that audience scope is included (e.g., work.secret.* but not personal.secret.*).
 */
export function shouldIncludeEngram(
  engramScopes: string[],
  audienceScope: string | undefined,
  includeSecret: boolean
): boolean {
  const hasSecretScope = engramScopes.some(isSecretScope);

  if (hasSecretScope && !includeSecret) {
    return false;
  }

  if (!audienceScope) {
    return true;
  }

  const matchesAudience = engramScopes.some((s) => matchesAudienceScope(s, audienceScope));

  if (!matchesAudience) {
    return false;
  }

  if (hasSecretScope && includeSecret) {
    const secretScopes = engramScopes.filter(isSecretScope);
    return secretScopes.some((s) => matchesAudienceScope(s, audienceScope));
  }

  return true;
}

/**
 * Filter retrieval results by audience scope and secret rules.
 * Applied post-retrieval as a safety net (retrieval filters are the primary gate).
 */
export function filterByScope(
  results: RetrievalResult[],
  audienceScope: string | undefined,
  includeSecret: boolean
): RetrievalResult[] {
  return results.filter((r) => {
    const scopes = (r.metadata['scopes'] as string[] | undefined) ?? [];
    return shouldIncludeEngram(scopes, audienceScope, includeSecret);
  });
}

/**
 * Build retrieval filters incorporating audience scope and secret rules.
 * These are applied at query time so secret content never enters the pipeline.
 */
export function buildScopeFilters(
  baseFilters: RetrievalFilters,
  audienceScope: string | undefined,
  includeSecret: boolean
): RetrievalFilters {
  const filters: RetrievalFilters = { ...baseFilters };

  if (audienceScope) {
    const prefix = audienceScope.endsWith('.*') ? audienceScope.slice(0, -2) : audienceScope;
    filters.scopes = [...(filters.scopes ?? []), prefix];
  }

  if (includeSecret) {
    filters.includeSecret = true;
  }

  return filters;
}

/**
 * Compute the default audience scope from retrieved sources.
 * Returns the broadest (shortest) non-secret scope prefix among all sources.
 * Returns 'all' if no scopes are found.
 */
export function computeDefaultAudienceScope(results: RetrievalResult[]): string {
  const allScopes = new Set<string>();

  for (const r of results) {
    const scopes = (r.metadata['scopes'] as string[] | undefined) ?? [];
    for (const s of scopes) {
      if (!isSecretScope(s)) {
        allScopes.add(s);
      }
    }
  }

  if (allScopes.size === 0) return 'all';

  const scopeList = [...allScopes].toSorted((a, b) => a.length - b.length);
  const shortest = scopeList[0];
  if (!shortest) return 'all';

  const segments = shortest.split('.');
  for (let i = segments.length; i > 0; i--) {
    const candidate = segments.slice(0, i).join('.');
    if (scopeList.every((s) => s === candidate || s.startsWith(candidate + '.'))) {
      return candidate + '.*';
    }
  }

  return 'all';
}
