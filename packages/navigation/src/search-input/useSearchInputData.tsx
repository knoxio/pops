import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Box, Building2, Film, PiggyBank, Search, Star, Tv } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { useCurrentApp } from '../hooks';
import { sortSections } from '../search-results/usePanelDismiss';
import { isInstalledModule } from './installed-module';

import type { ReactNode } from 'react';

import type { SearchResultHit, SearchResultSection } from '../SearchResultsPanel';

const ICON_MAP: Record<string, ReactNode> = {
  Film: <Film className="h-3.5 w-3.5" />,
  Tv: <Tv className="h-3.5 w-3.5" />,
  Box: <Box className="h-3.5 w-3.5" />,
  ArrowRightLeft: <ArrowRightLeft className="h-3.5 w-3.5" />,
  PiggyBank: <PiggyBank className="h-3.5 w-3.5" />,
  Building2: <Building2 className="h-3.5 w-3.5" />,
  Star: <Star className="h-3.5 w-3.5" />,
};

/**
 * Shell path the dev Vite proxy / production nginx rewrites onto the
 * federated-search orchestrator (`POST /search`, ADR-029 epic 06). The proxy
 * strips the `/orchestrator-api` prefix so the orchestrator sees `/search`.
 */
const ORCHESTRATOR_SEARCH_URL = '/orchestrator-api/search';

function domainToLabel(domain: string): string {
  return domain
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface RawHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: string;
  data?: unknown;
}

interface RawSection {
  domain: string;
  /** PRD-101 US-06: owning module id; absent-module sections are filtered. */
  moduleId: string;
  hits: RawHit[];
  icon: string;
  color: string;
  isContextSection: boolean;
  totalCount: number;
}

interface OrchestratorSearchResponse {
  sections: RawSection[];
}

function isRawHit(value: unknown): value is RawHit {
  if (typeof value !== 'object' || value === null) return false;
  const hit = value as Record<string, unknown>;
  return (
    typeof hit.uri === 'string' &&
    typeof hit.score === 'number' &&
    typeof hit.matchField === 'string' &&
    typeof hit.matchType === 'string'
  );
}

function isRawSection(value: unknown): value is RawSection {
  if (typeof value !== 'object' || value === null) return false;
  const section = value as Record<string, unknown>;
  return (
    typeof section.domain === 'string' &&
    typeof section.moduleId === 'string' &&
    typeof section.icon === 'string' &&
    typeof section.color === 'string' &&
    typeof section.isContextSection === 'boolean' &&
    typeof section.totalCount === 'number' &&
    Array.isArray(section.hits) &&
    section.hits.every(isRawHit)
  );
}

function parseSearchResponse(value: unknown): OrchestratorSearchResponse {
  if (typeof value !== 'object' || value === null) {
    throw new Error('orchestrator /search: response is not an object');
  }
  const sections = (value as Record<string, unknown>).sections;
  if (!Array.isArray(sections) || !sections.every(isRawSection)) {
    throw new Error('orchestrator /search: malformed `sections`');
  }
  return { sections };
}

interface SearchContextBody {
  app: string | null;
  page: string | null;
}

async function fetchOrchestratorSearch(
  text: string,
  context: SearchContextBody,
  signal: AbortSignal
): Promise<OrchestratorSearchResponse> {
  const response = await fetch(ORCHESTRATOR_SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: { text }, context }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`orchestrator /search failed: ${response.status}`);
  }
  return parseSearchResponse(await response.json());
}

function toHits(rawHits: RawHit[]): SearchResultHit[] {
  return rawHits.map((h) => ({
    uri: h.uri,
    score: h.score,
    matchField: h.matchField,
    matchType: h.matchType,
    data: (h.data ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Map the orchestrator's federated `{ sections }` envelope onto the renderer's
 * `SearchResultSection[]`. The wire shape is byte-identical to the monolith's
 * old `core.search.query` output, so the only transforms are the icon lookup
 * and the human label.
 *
 * `totalCount` is clamped to the number of returned hits: the orchestrator
 * exposes no pagination cursor (`POST /search` returns a single capped page
 * and no `showMore`), so the section's "Show more" affordance — which the
 * renderer keys off `totalCount > hits.length` — is intentionally suppressed
 * rather than promising more results the FE cannot fetch.
 */
function buildSections(rawSections: RawSection[] | undefined): SearchResultSection[] {
  if (!rawSections) return [];
  return rawSections
    .filter((section) => isInstalledModule(section.moduleId))
    .map((section) => {
      const hits = toHits(section.hits);
      return {
        domain: section.domain,
        label: domainToLabel(section.domain),
        icon: ICON_MAP[section.icon] ?? <Search className="h-3.5 w-3.5" />,
        color: section.color,
        isContext: section.isContextSection,
        hits,
        totalCount: hits.length,
      };
    });
}

interface UseSearchInputDataArgs {
  query: string;
  isOpen: boolean;
}

interface UseSearchInputDataResult {
  sections: SearchResultSection[];
  orderedUris: string[];
  handleShowMore: (domain: string) => Promise<void>;
}

export function useSearchInputData({
  query,
  isOpen,
}: UseSearchInputDataArgs): UseSearchInputDataResult {
  const currentApp = useCurrentApp();

  const { data: searchData } = useQuery({
    queryKey: ['orchestrator-search', query, currentApp ?? null],
    queryFn: ({ signal }) =>
      fetchOrchestratorSearch(query, { app: currentApp ?? null, page: null }, signal),
    enabled: isOpen && query.length > 0,
  });

  const sections = useMemo(() => buildSections(searchData?.sections), [searchData]);
  const orderedUris = useMemo(
    () => sortSections(sections).flatMap((s) => s.hits.map((h) => h.uri)),
    [sections]
  );

  /**
   * The orchestrator has no pagination endpoint yet, so there is nothing more
   * to fetch. `buildSections` already clamps `totalCount` so the renderer never
   * shows the "Show more" control; this no-op keeps the hook's public surface
   * stable for consumers until the orchestrator grows a cursor.
   */
  const handleShowMore = useCallback((_domain: string): Promise<void> => Promise.resolve(), []);

  return { sections, orderedUris, handleShowMore };
}
