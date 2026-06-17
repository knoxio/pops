import { useQuery } from '@tanstack/react-query';
import { Compass, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
/**
 * DiscoverPage — dynamic shelf-based movie discovery.
 */

import { PreferenceProfile } from '../components/PreferenceProfile';
import { useDiscoverCardActions } from '../hooks/useDiscoverCardActions';
import { unwrap } from '../media-api-helpers.js';
import {
  discoveryAssembleSession,
  discoveryGetDismissed,
  discoveryProfile,
} from '../media-api/index.js';
import {
  COMPARISON_THRESHOLD,
  CompareUnlockPrompt,
  DiscoverHeader,
  DiscoverShelves,
  DiscoverSkeleton,
} from './discover/DiscoverPageParts';

import type { ComponentProps } from 'react';

type DiscoverShelf = ComponentProps<typeof DiscoverShelves>['shelves'][number];

function useDiscoverPageModel() {
  const session = useQuery({
    queryKey: ['media', 'discovery', 'assembleSession'],
    queryFn: async () => unwrap(await discoveryAssembleSession()),
    staleTime: 0,
  });
  const profile = useQuery({
    queryKey: ['media', 'discovery', 'profile'],
    queryFn: async () => unwrap(await discoveryProfile()),
    staleTime: 5 * 60 * 1000,
  });
  const dismissed = useQuery({
    queryKey: ['media', 'discovery', 'getDismissed'],
    queryFn: async () => unwrap(await discoveryGetDismissed()),
    staleTime: 5 * 60 * 1000,
  });
  const actions = useDiscoverCardActions();

  const totalComparisons = profile.data?.data?.totalComparisons ?? 0;
  const hasEnoughComparisons = totalComparisons >= COMPARISON_THRESHOLD;

  const dismissedSet = useMemo(
    () => new Set([...(dismissed.data?.data ?? []), ...Array.from(actions.optimisticDismissed)]),
    [dismissed.data, actions.optimisticDismissed]
  );

  const shelves = useMemo<DiscoverShelf[]>(
    () =>
      (session.data?.shelves ?? []).map((shelf) => ({
        shelfId: shelf.shelfId,
        title: shelf.title,
        subtitle: shelf.subtitle ?? undefined,
        emoji: shelf.emoji ?? undefined,
        items: shelf.items,
        hasMore: shelf.hasMore,
      })),
    [session.data]
  );

  return {
    session,
    profile,
    actions,
    totalComparisons,
    hasEnoughComparisons,
    dismissedSet,
    shelves,
  };
}

function EmptyState() {
  return (
    <div className="py-12 text-center">
      <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Assembling your discover page…</p>
    </div>
  );
}

function ErrorBanner() {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      Failed to load discover shelves. Please refresh the page.
    </div>
  );
}

export function DiscoverPage() {
  const m = useDiscoverPageModel();
  const { session } = m;

  return (
    <div className="space-y-8 pb-8">
      <div className="flex items-center gap-3">
        <Compass className="h-6 w-6 text-muted-foreground" />
        <DiscoverHeader isFetching={session.isFetching} onRefresh={() => void session.refetch()} />
      </div>

      <CompareUnlockPrompt
        show={!m.hasEnoughComparisons && !m.profile.isLoading}
        totalComparisons={m.totalComparisons}
      />

      {session.isLoading && <DiscoverSkeleton />}
      {session.error && !session.isLoading && <ErrorBanner />}

      {!session.isLoading && (
        <DiscoverShelves shelves={m.shelves} dismissedSet={m.dismissedSet} actions={m.actions} />
      )}

      {!session.isLoading && !session.error && m.shelves.length === 0 && <EmptyState />}

      <PreferenceProfile data={m.profile.data?.data} isLoading={m.profile.isLoading} />
    </div>
  );
}
