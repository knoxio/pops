import { gte, inArray, lte, ne, sql } from 'drizzle-orm';

import { engramIndex, engramScopes, engramTags } from '@pops/db-types';

import type { SQL } from 'drizzle-orm';

import type { RetrievalFilters } from './types.js';

function statusConditions(filters: RetrievalFilters): SQL[] {
  if (filters.status?.length) {
    return [inArray(engramIndex.status, filters.status)];
  }
  return [ne(engramIndex.status, 'orphaned')];
}

function customFieldConditions(filters: RetrievalFilters): SQL[] {
  if (!filters.customFields) return [];
  return Object.entries(filters.customFields).map(
    ([key, value]) => sql`json_extract(${engramIndex.customFields}, ${`$.${key}`}) = ${value}`
  );
}

function secretExclusionCondition(filters: RetrievalFilters): SQL[] {
  if (filters.includeSecret) return [];
  return [
    sql`not exists (
      select 1 from ${engramScopes}
      where ${engramScopes.engramId} = ${engramIndex.id}
        and (
          ${engramScopes.scope} = 'secret'
          or ${engramScopes.scope} like '%.secret.%'
          or ${engramScopes.scope} like 'secret.%'
          or ${engramScopes.scope} like '%.secret'
        )
    )`,
  ];
}

function scopeFilterCondition(filters: RetrievalFilters): SQL[] {
  const scopeFilters = filters.scopes;
  if (!scopeFilters || scopeFilters.length === 0) return [];
  const scopePredicates = scopeFilters.map((f) => {
    const prefix = `${f}.%`;
    return sql`(${engramScopes.scope} = ${f} or ${engramScopes.scope} like ${prefix})`;
  });
  return [
    sql`exists (
      select 1 from ${engramScopes}
      where ${engramScopes.engramId} = ${engramIndex.id}
        and (${sql.join(scopePredicates, sql` or `)})
    )`,
  ];
}

function tagFilterCondition(filters: RetrievalFilters): SQL[] {
  const tagFilters = filters.tags ? [...new Set(filters.tags)] : undefined;
  if (!tagFilters || tagFilters.length === 0) return [];
  const tagParams = tagFilters.map((t) => sql`${t}`);
  return [
    sql`(
      select count(distinct ${engramTags.tag})
      from ${engramTags}
      where ${engramTags.engramId} = ${engramIndex.id}
        and ${engramTags.tag} in (${sql.join(tagParams, sql`, `)})
    ) = ${tagFilters.length}`,
  ];
}

function dateRangeConditions(filters: RetrievalFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.dateRange?.from) conditions.push(gte(engramIndex.createdAt, filters.dateRange.from));
  if (filters.dateRange?.to) conditions.push(lte(engramIndex.createdAt, filters.dateRange.to));
  return conditions;
}

function typeConditions(filters: RetrievalFilters): SQL[] {
  if (!filters.types?.length) return [];
  return [inArray(engramIndex.type, filters.types)];
}

export function buildStructuredConditions(filters: RetrievalFilters): SQL[] {
  return [
    ...statusConditions(filters),
    ...typeConditions(filters),
    ...dateRangeConditions(filters),
    ...customFieldConditions(filters),
    ...secretExclusionCondition(filters),
    ...scopeFilterCondition(filters),
    ...tagFilterCondition(filters),
  ];
}
