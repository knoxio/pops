import type { DraftSort, IngestSourceKind, QualityBand } from '@pops/app-food-db';
/**
 * PRD-134 — Drafts-tab filter types + URL-hash codec.
 *
 * Filter state lives in the URL hash (`#filters=<base64url(json)>`) so
 * sharing / refresh preserves context. We base64url-encode rather than
 * stuff the JSON in raw so the hash stays free of `%`-escaped characters
 * and so it survives the React Router pass-through unchanged.
 */
import type { PartialReason } from '@pops/food-contracts';

export interface DraftsFiltersState {
  bands: readonly QualityBand[];
  kinds: readonly IngestSourceKind[];
  partialReasons: readonly PartialReason[];
  freshOnly: boolean;
  sort: DraftSort;
}

export const ALL_BANDS: readonly QualityBand[] = ['clean', 'minor', 'attention', 'blocked'];
export const ALL_INGEST_KINDS: readonly IngestSourceKind[] = [
  'url-web',
  'url-instagram',
  'text',
  'screenshot',
];
export const ALL_PARTIAL_REASONS: readonly PartialReason[] = [
  'auth-dead',
  'rate-limited',
  'stt-failed',
  'vision-failed',
  'caption-only-fallback',
  'empty-extraction',
];

export const DEFAULT_DRAFTS_FILTERS: DraftsFiltersState = Object.freeze({
  bands: ALL_BANDS,
  kinds: [],
  partialReasons: [],
  freshOnly: false,
  sort: 'quality-asc',
});

/** Returns the part of the state worth shipping to the API. */
export function toQueryInput(filters: DraftsFiltersState): {
  bands?: QualityBand[];
  kinds?: IngestSourceKind[];
  partialReasons?: PartialReason[];
  freshOnly?: boolean;
  sort?: DraftSort;
} {
  return {
    // PRD-134: the "all selected" UI default collapses to undefined on the
    // wire so the SQL skips the WHERE-IN clause. Same shape PRD-140-B used
    // for kind filters — Copilot R1 lessons captured.
    bands: filters.bands.length === ALL_BANDS.length ? undefined : [...filters.bands],
    kinds: filters.kinds.length === 0 ? undefined : [...filters.kinds],
    partialReasons: filters.partialReasons.length === 0 ? undefined : [...filters.partialReasons],
    freshOnly: filters.freshOnly ? true : undefined,
    sort: filters.sort,
  };
}

const HASH_PREFIX = 'filters=';

export function encodeFiltersHash(filters: DraftsFiltersState): string {
  // Drop defaults so the hash is empty when the filters are pristine and the
  // URL stays readable.
  const minimal: Record<string, unknown> = {};
  if (filters.bands.length !== ALL_BANDS.length) minimal.bands = [...filters.bands];
  if (filters.kinds.length > 0) minimal.kinds = [...filters.kinds];
  if (filters.partialReasons.length > 0) minimal.partialReasons = [...filters.partialReasons];
  if (filters.freshOnly) minimal.freshOnly = true;
  if (filters.sort !== DEFAULT_DRAFTS_FILTERS.sort) minimal.sort = filters.sort;
  if (Object.keys(minimal).length === 0) return '';
  const json = JSON.stringify(minimal);
  return `${HASH_PREFIX}${toBase64Url(json)}`;
}

export function decodeFiltersHash(hash: string): DraftsFiltersState {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!trimmed.startsWith(HASH_PREFIX)) return DEFAULT_DRAFTS_FILTERS;
  const encoded = trimmed.slice(HASH_PREFIX.length);
  if (encoded.length === 0) return DEFAULT_DRAFTS_FILTERS;
  try {
    const decoded = fromBase64Url(encoded);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return mergeWithDefault(parsed);
  } catch {
    return DEFAULT_DRAFTS_FILTERS;
  }
}

function mergeWithDefault(raw: Record<string, unknown>): DraftsFiltersState {
  return {
    bands: pickArray(raw.bands, ALL_BANDS) ?? DEFAULT_DRAFTS_FILTERS.bands,
    kinds: pickArray(raw.kinds, ALL_INGEST_KINDS) ?? DEFAULT_DRAFTS_FILTERS.kinds,
    partialReasons:
      pickArray(raw.partialReasons, ALL_PARTIAL_REASONS) ?? DEFAULT_DRAFTS_FILTERS.partialReasons,
    freshOnly:
      typeof raw.freshOnly === 'boolean' ? raw.freshOnly : DEFAULT_DRAFTS_FILTERS.freshOnly,
    sort: isDraftSort(raw.sort) ? raw.sort : DEFAULT_DRAFTS_FILTERS.sort,
  };
}

function pickArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    if (typeof item === 'string' && (allowed as readonly string[]).includes(item)) {
      out.push(item as T);
    }
  }
  return out;
}

function isDraftSort(value: unknown): value is DraftSort {
  return (
    value === 'quality-asc' || value === 'quality-desc' || value === 'oldest' || value === 'newest'
  );
}

function toBase64Url(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64url');
  }
  // Browser path — btoa() outputs base64, not base64url; swap the alphabet.
  const b64 = globalThis.btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'base64url').toString('utf8');
  }
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return decodeURIComponent(escape(globalThis.atob(padded + padding)));
}
