/**
 * Sub-hook: fetches templates and scopes, stabilises references
 * with useRef to avoid memo/callback dependency churn.
 */
import { useMemo, useRef } from 'react';

import { trpc } from '@pops/api-client';

import { ENGRAM_TYPE_LABELS, ENGRAM_TYPES } from './types';

import type { ScopeEntry, TagEntry, TemplateSummary } from './types';

export function useTemplateAndScopeData() {
  const templatesQuery = trpc.cerebrum.templates.list.useQuery();
  const scopesQuery = trpc.cerebrum.scopes.list.useQuery();
  const tagsQuery = trpc.cerebrum.tags.list.useQuery();

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

  const typeOptions = useMemo(() => {
    const templatesByName = new Map<string, TemplateSummary>(
      templates.map((t: TemplateSummary) => [t.name, t])
    );
    return ENGRAM_TYPES.map((typeName) => {
      const tpl = templatesByName.get(typeName);
      return {
        value: typeName,
        label: ENGRAM_TYPE_LABELS[typeName],
        description: tpl?.description ?? '',
      };
    });
  }, [templates]);

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
    typeOptions,
    scopeSuggestions,
    tagSuggestions: knownTags,
    templatesLoading: templatesQuery.isLoading,
    scopesLoading: scopesQuery.isLoading,
    tagsLoading: tagsQuery.isLoading,
  };
}
