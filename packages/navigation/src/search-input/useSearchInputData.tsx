import { ArrowRightLeft, Box, Building2, Film, PiggyBank, Search, Star, Tv } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useCurrentApp } from '../hooks';
import { sortSections } from '../search-results/usePanelDismiss';

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
  hits: RawHit[];
  icon: string;
  color: string;
  isContextSection: boolean;
  totalCount: number;
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

function buildSections(
  rawSections: RawSection[] | undefined,
  extraHits: Record<string, SearchResultHit[]>
): SearchResultSection[] {
  if (!rawSections) return [];
  return rawSections.map((section) => {
    const baseHits = toHits(section.hits);
    const extra = extraHits[section.domain] ?? [];
    return {
      domain: section.domain,
      label: domainToLabel(section.domain),
      icon: ICON_MAP[section.icon] ?? <Search className="h-3.5 w-3.5" />,
      color: section.color,
      isContext: section.isContextSection,
      hits: [...baseHits, ...extra],
      totalCount: section.totalCount,
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
  const utils = trpc.useUtils();
  const [extraHits, setExtraHits] = useState<Record<string, SearchResultHit[]>>({});

  const { data: searchData } = trpc.core.search.query.useQuery(
    { text: query, context: { app: currentApp ?? null, page: null } },
    { enabled: isOpen && query.length > 0 }
  );

  useEffect(() => {
    setExtraHits({});
  }, [query]);

  const sections = useMemo(
    () => buildSections(searchData?.sections as RawSection[] | undefined, extraHits),
    [searchData, extraHits]
  );
  const orderedUris = useMemo(
    () => sortSections(sections).flatMap((s) => s.hits.map((h) => h.uri)),
    [sections]
  );

  const handleShowMore = useCallback(
    async (domain: string) => {
      const section = sections.find((s) => s.domain === domain);
      const offset = section?.hits.length ?? 0;
      const result = await utils.core.search.showMore.fetch({
        domain,
        text: query,
        context: { app: currentApp ?? null, page: null },
        offset,
      });
      const newHits = toHits(result.hits as RawHit[]);
      setExtraHits((prev) => ({
        ...prev,
        [domain]: [...(prev[domain] ?? []), ...newHits],
      }));
    },
    [sections, query, currentApp, utils]
  );

  return { sections, orderedUris, handleShowMore };
}
