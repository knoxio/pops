import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rotationDownloadCandidateMock = vi.hoisted(() => vi.fn());
const rotationAddExclusionMock = vi.hoisted(() => vi.fn());
const rotationRemoveExclusionMock = vi.hoisted(() => vi.fn());

vi.mock('../../media-api/index.js', () => ({
  rotationDownloadCandidate: (...args: unknown[]) => rotationDownloadCandidateMock(...args),
  rotationAddExclusion: (...args: unknown[]) => rotationAddExclusionMock(...args),
  rotationRemoveExclusion: (...args: unknown[]) => rotationRemoveExclusionMock(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { useCardMutations } from './useCardMutations';

import type { Candidate } from './CandidateCard';

const candidate: Candidate = {
  id: 7,
  tmdbId: 550,
  title: 'Fight Club',
  year: 1999,
  rating: 8.4,
  posterPath: null,
  discoveredAt: '2026-01-01T00:00:00Z',
  sourceName: 'Manual',
  sourcePriority: 1,
};

function setupHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const setPopoverOpen = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useCardMutations(candidate, setPopoverOpen), { wrapper });
  return { result, invalidateSpy, setPopoverOpen };
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  rotationDownloadCandidateMock.mockResolvedValue({
    data: { data: { success: true, alreadyInRadarr: false } },
    error: undefined,
  });
  rotationAddExclusionMock.mockResolvedValue({ data: { message: 'ok' }, error: undefined });
  rotationRemoveExclusionMock.mockResolvedValue({
    data: { data: { success: true } },
    error: undefined,
  });
});

describe('useCardMutations', () => {
  describe('download', () => {
    it('downloads by candidate id and invalidates the candidates list', async () => {
      const { result, invalidateSpy } = setupHook();

      result.current.downloadMutation.mutate({ candidateId: 7 });

      await waitFor(() => expect(result.current.downloadMutation.isSuccess).toBe(true));
      expect(rotationDownloadCandidateMock).toHaveBeenCalledWith({ path: { candidateId: 7 } });
      expect(mockToastSuccess).toHaveBeenCalledWith('Downloading "Fight Club"');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'rotation', 'listCandidates'],
      });
    });

    it('toasts the error message when the download fails', async () => {
      rotationDownloadCandidateMock.mockResolvedValue({
        data: undefined,
        error: { message: 'radarr offline' },
        response: { status: 500 },
      });
      const { result } = setupHook();

      result.current.downloadMutation.mutate({ candidateId: 7 });

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('radarr offline'));
    });
  });

  describe('exclude', () => {
    it('sends only tmdbId + reason (title is resolved server-side) and closes the popover', async () => {
      const { result, invalidateSpy, setPopoverOpen } = setupHook();

      result.current.excludeMutation.mutate({
        tmdbId: 550,
        title: 'Fight Club',
        reason: 'seen it',
      });

      await waitFor(() => expect(result.current.excludeMutation.isSuccess).toBe(true));
      expect(rotationAddExclusionMock).toHaveBeenCalledWith({
        body: { tmdbId: 550, reason: 'seen it' },
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('Excluded "Fight Club"');
      expect(setPopoverOpen).toHaveBeenCalledWith(false);
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'rotation', 'listCandidates'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'rotation', 'listExclusions'],
      });
    });
  });

  describe('unexclude', () => {
    it('removes the exclusion by tmdbId and invalidates both lists', async () => {
      const { result, invalidateSpy } = setupHook();

      result.current.unexcludeMutation.mutate({ tmdbId: 550 });

      await waitFor(() => expect(result.current.unexcludeMutation.isSuccess).toBe(true));
      expect(rotationRemoveExclusionMock).toHaveBeenCalledWith({ path: { tmdbId: 550 } });
      expect(mockToastSuccess).toHaveBeenCalledWith('Restored "Fight Club" to queue');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'rotation', 'listCandidates'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'rotation', 'listExclusions'],
      });
    });
  });
});
