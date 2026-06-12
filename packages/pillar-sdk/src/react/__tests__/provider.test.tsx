// @vitest-environment jsdom
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PillarSdkProvider, usePillarSdkOptions } from '../provider.js';

import type { ReactNode } from 'react';

describe('PillarSdkProvider', () => {
  it('exposes the configured options through usePillarSdkOptions', () => {
    const options = { contractVersion: '1.2.3' };
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <PillarSdkProvider options={options}>{children}</PillarSdkProvider>
    );
    const { result } = renderHook(() => usePillarSdkOptions(), { wrapper });
    expect(result.current.contractVersion).toBe('1.2.3');
  });

  it('returns empty options when no provider is mounted', () => {
    const { result } = renderHook(() => usePillarSdkOptions());
    expect(result.current).toEqual({});
  });

  it('wires a QueryClientProvider when queryClient is passed', () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <PillarSdkProvider queryClient={queryClient}>{children}</PillarSdkProvider>
    );
    const { result } = renderHook(() => useQueryClient(), { wrapper });
    expect(result.current).toBe(queryClient);
  });
});
