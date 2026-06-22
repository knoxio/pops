/**
 * Tests for `useSettingsSections` (settings-federation S3) — the live-registry
 * discovery hook that maps each pillar's settings manifest to its owning pillar
 * and live `hasFederatedSettings` flag. This is the seam the Settings page uses
 * to decide which pillar each section's read/write routes to.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropsWithChildren } from 'react';

const mocks = vi.hoisted(() => ({ fetchSettingsSnapshot: vi.fn() }));

vi.mock('@/lib/settings-snapshot', () => ({
  fetchSettingsSnapshot: mocks.fetchSettingsSnapshot,
}));

import { useSettingsSections } from './useSettingsSections';

import type { ManifestPayload, PillarSnapshot } from '@pops/pillar-sdk';

function manifest(pillarId: string, settingsId: string): ManifestPayload {
  return {
    pillar: pillarId,
    version: '1.0.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '1.0.0',
      tag: `contract-${pillarId}@v1.0.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [`${pillarId}/entity`] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    settings: { manifests: [{ id: settingsId, title: settingsId, order: 0, groups: [] }] },
  };
}

function snapshot(
  pillarId: string,
  settingsId: string,
  capabilities?: Record<string, boolean>
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    manifest: manifest(pillarId, settingsId),
    registered: true,
    lastSeenAt: new Date('2026-06-22T00:00:00.000Z'),
    ...(capabilities !== undefined ? { capabilities } : {}),
  };
}

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSettingsSections', () => {
  it('maps each contribution to its owning pillar and live capability flag', async () => {
    mocks.fetchSettingsSnapshot.mockResolvedValue([
      snapshot('finance', 'finance', { settings: true }),
      snapshot('cerebrum', 'cerebrum'),
    ]);

    const { result } = renderHook(() => useSettingsSections(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sections = result.current.data ?? [];
    const finance = sections.find((s) => s.manifest.id === 'finance');
    const cerebrum = sections.find((s) => s.manifest.id === 'cerebrum');

    expect(finance).toMatchObject({ ownerPillar: 'finance', hasFederatedSettings: true });
    expect(cerebrum).toMatchObject({ ownerPillar: 'cerebrum', hasFederatedSettings: false });
  });

  it('returns no sections when the snapshot is empty', async () => {
    mocks.fetchSettingsSnapshot.mockResolvedValue([]);
    const { result } = renderHook(() => useSettingsSections(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
