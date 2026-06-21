/**
 * Sub-hook: fetches templates and scopes, stabilises references
 * with useRef to avoid memo/callback dependency churn.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';

import { scopesList, tagsList, templatesList } from '../../cerebrum-api';
import { unwrap } from '../../cerebrum-api-helpers';
import { ENGRAM_TYPE_LABELS, ENGRAM_TYPES } from './types';

import type { ScopeEntry, TagEntry, TemplateSummary } from './types';

const TYPE_OPTIONS = ENGRAM_TYPES.map((typeName) => ({
  value: typeName,
  label: ENGRAM_TYPE_LABELS[typeName],
}));

export function useTemplateAndScopeData() {
  const templatesQuery = useQuery({
    queryKey: ['cerebrum', 'templates', 'list'],
    queryFn: async () => unwrap(await templatesList()),
  });
  const scopesQuery = useQuery({
    queryKey: ['cerebrum', 'scopes', 'list'],
    queryFn: async () => unwrap(await scopesList({ query: {} })),
  });
  const tagsQuery = useQuery({
    queryKey: ['cerebrum', 'tags', 'list'],
    queryFn: async () => unwrap(await tagsList()),
  });

  const templatesRef = useRef<TemplateSummary[]>([]);
  const rawTemplates = templatesQuery.data?.templates;
  if (rawTemplates) templatesRef.current = rawTemplates;
  const templates = templatesRef.current;

  const scopesRef = useRef<ScopeEntry[]>([]);
  const rawScopes = scopesQuery.data?.scopes;
  if (rawScopes) scopesRef.current = rawScopes;
  const knownScopes = scopesRef.current;

  const tagsRef = useRef<TagEntry[]>([]);
  const rawTags = tagsQuery.data?.tags;
  if (rawTags) tagsRef.current = rawTags;
  const knownTags = tagsRef.current;

  const scopeSuggestions = useMemo(
    () =>
      knownScopes.map((s) => ({
        label: s.scope,
        value: s.scope,
        description: `${s.count} engram${s.count === 1 ? '' : 's'}`,
      })),
    [knownScopes]
  );

  return {
    templates,
    knownScopes,
    knownTags,
    typeOptions: TYPE_OPTIONS,
    scopeSuggestions,
    tagSuggestions: knownTags,
    templatesLoading: templatesQuery.isLoading,
    scopesLoading: scopesQuery.isLoading,
    tagsLoading: tagsQuery.isLoading,
  };
}
