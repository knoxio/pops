/**
 * Plexus ingestion filters (PRD-090, US-04).
 *
 * Lifted from the pops-api monolith during the cerebrum REST migration.
 * Per-adapter include/exclude rules evaluated before content enters the
 * ingestion pipeline. Regex patterns are compiled once at evaluation time
 * (callers should cache compiled patterns for hot paths).
 */
import type { EngineData, FilterRule, FilterType } from './types.js';

interface CompiledFilter {
  filterType: FilterType;
  field: string;
  regex: RegExp;
}

/**
 * Compile a filter rule's pattern into a RegExp. Returns `null` if the pattern
 * is invalid (caller should log a warning and skip).
 */
export function compileFilter(rule: FilterRule): CompiledFilter | null {
  try {
    return {
      filterType: rule.filterType,
      field: rule.field,
      regex: new RegExp(rule.pattern),
    };
  } catch {
    return null;
  }
}

/**
 * Compile all enabled filter rules. Invalid patterns are silently dropped
 * (caller should log a warning for diagnostics).
 */
export function compileFilters(rules: FilterRule[]): {
  compiled: CompiledFilter[];
  invalid: FilterRule[];
} {
  const compiled: CompiledFilter[] = [];
  const invalid: FilterRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const c = compileFilter(rule);
    if (c) {
      compiled.push(c);
    } else {
      invalid.push(rule);
    }
  }

  return { compiled, invalid };
}

/** Well-known scalar fields on EngineData. */
const SCALAR_FIELDS: ReadonlySet<string> = new Set([
  'body',
  'title',
  'type',
  'source',
  'externalId',
]);

/** Well-known array fields on EngineData (joined as comma-separated strings). */
const ARRAY_FIELDS: ReadonlySet<string> = new Set(['tags', 'scopes']);

/**
 * Extract the value of a named field from an `EngineData` item.
 *
 * Adapter-specific fields live in `customFields`; well-known fields (`body`,
 * `title`, `type`, `source`) are checked first.
 */
export function extractField(item: EngineData, field: string): string | undefined {
  if (SCALAR_FIELDS.has(field)) {
    return item[field as keyof EngineData] as string | undefined;
  }

  if (ARRAY_FIELDS.has(field)) {
    const arr = item[field as 'tags' | 'scopes'];
    return arr ? arr.join(',') : undefined;
  }

  const value = item.customFields?.[field];
  if (value == null) return undefined;
  return typeof value === 'string' ? value : String(value);
}

/**
 * Test a single item against a list of compiled filters for a given type
 * (include or exclude).
 */
function matchesAny(item: EngineData, filters: CompiledFilter[], type: FilterType): boolean {
  const subset = filters.filter((f) => f.filterType === type);
  if (subset.length === 0) return false;
  return subset.some((f) => {
    const value = extractField(item, f.field);
    if (value === undefined) return false;
    return f.regex.test(value);
  });
}

/**
 * Evaluate whether a single item passes the filter rules.
 *
 * Evaluation order (per PRD-090):
 * 1. If include filters exist: item must match at least one include filter.
 * 2. If exclude filters exist: item must not match any exclude filter.
 * 3. Items that survive both checks are accepted.
 */
export function evaluateItem(item: EngineData, compiled: CompiledFilter[]): boolean {
  const hasIncludes = compiled.some((f) => f.filterType === 'include');
  const hasExcludes = compiled.some((f) => f.filterType === 'exclude');

  if (hasIncludes && !matchesAny(item, compiled, 'include')) {
    return false;
  }

  if (hasExcludes && matchesAny(item, compiled, 'exclude')) {
    return false;
  }

  return true;
}

export interface FilterResult {
  /** Items that passed all filters. */
  accepted: EngineData[];
  /** Number of items removed by filters. */
  filtered: number;
}

/**
 * Apply filter rules to a batch of `EngineData` items.
 *
 * @param items - Raw items from the adapter.
 * @param rules - Filter rules (from `plexus_filters` table).
 * @returns Accepted items and the count of filtered items.
 */
export function applyFilters(items: EngineData[], rules: FilterRule[]): FilterResult {
  if (rules.length === 0) {
    return { accepted: items, filtered: 0 };
  }

  const { compiled, invalid } = compileFilters(rules);
  if (invalid.length > 0) {
    for (const r of invalid) {
      console.warn(
        `[plexus] Invalid filter pattern '${r.pattern}' for field '${r.field}' — skipped`
      );
    }
  }

  if (compiled.length === 0) {
    return { accepted: items, filtered: 0 };
  }

  const accepted: EngineData[] = [];
  let filtered = 0;

  for (const item of items) {
    if (evaluateItem(item, compiled)) {
      accepted.push(item);
    } else {
      filtered++;
    }
  }

  return { accepted, filtered };
}

export interface DryRunResult {
  /** Items that would be ingested. */
  wouldIngest: EngineData[];
  /** Items that would be filtered out. */
  wouldFilter: EngineData[];
}

/** Dry-run: show what would be ingested vs filtered without writing anything. */
export function dryRun(items: EngineData[], rules: FilterRule[]): DryRunResult {
  if (rules.length === 0) {
    return { wouldIngest: items, wouldFilter: [] };
  }

  const { compiled } = compileFilters(rules);
  if (compiled.length === 0) {
    return { wouldIngest: items, wouldFilter: [] };
  }

  const wouldIngest: EngineData[] = [];
  const wouldFilter: EngineData[] = [];

  for (const item of items) {
    if (evaluateItem(item, compiled)) {
      wouldIngest.push(item);
    } else {
      wouldFilter.push(item);
    }
  }

  return { wouldIngest, wouldFilter };
}
