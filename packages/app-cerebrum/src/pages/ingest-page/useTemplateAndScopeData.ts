/**
 * Sub-hook: fetches templates and scopes, stabilises references
 * with useRef to avoid memo/callback dependency churn.
 */
import { useMemo, useRef } from 'react';

import { trpc } from '@pops/api-client';

import type { ScopeEntry, TemplateSummary } from './types';

export function useTemplateAndScopeData() {
  const templatesQuery = trpc.cerebrum.templates.list.useQuery();
  const scopesQuery = trpc.cerebrum.scopes.list.useQuery();

  const templatesRef = useRef<TemplateSummary[]>([]);
  const rawTemplates = templatesQuery.data?.templates;
  if (rawTemplates) templatesRef.current = rawTemplates;
  const templates = templatesRef.current;

  const scopesRef = useRef<ScopeEntry[]>([]);
  const rawScopes = scopesQuery.data?.scopes;
  if (rawScopes) scopesRef.current = rawScopes;
  const knownScopes = scopesRef.current;

  const typeOptions = useMemo(() => {
    const opts = templates
      .filter((t) => t.name !== 'capture')
      .map((t) => ({
        value: t.name,
        label: t.name,
        description: t.description,
      }));
    opts.unshift({
      value: 'capture',
      label: 'capture',
      description: 'Freeform capture — no template',
    });
    return opts;
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
    typeOptions,
    scopeSuggestions,
    templatesLoading: templatesQuery.isLoading,
    scopesLoading: scopesQuery.isLoading,
  };
}
