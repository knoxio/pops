import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (pillarId: string, path: readonly string[], input: unknown) =>
    mocks.query({ pillarId, path: [...path], input }),
}));

import { IndexRedirect } from './IndexRedirect';

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="landed">{pathname}</div>;
}

function renderAt(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<IndexRedirect />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function queryResult(extra: Record<string, unknown>) {
  return {
    data: undefined,
    isUnavailable: false,
    isContractMismatch: false,
    ...extra,
  };
}

describe('IndexRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a manifest query against the core pillar', () => {
    mocks.query.mockReturnValue(queryResult({}));
    renderAt();
    expect(mocks.query).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['shell', 'manifest'],
      input: undefined,
    });
  });

  it('falls back to /finance when the manifest has not yet loaded', () => {
    mocks.query.mockReturnValue(queryResult({}));
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/finance');
  });

  it('falls back to /finance when the SDK reports the core pillar unavailable', () => {
    mocks.query.mockReturnValue(queryResult({ isUnavailable: true }));
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/finance');
  });

  it('falls back to /finance when the SDK reports a contract mismatch', () => {
    mocks.query.mockReturnValue(queryResult({ isContractMismatch: true }));
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/finance');
  });

  it('picks the first installed app by nav.order ascending (finance > media > inventory > food > lists > cerebrum > ai)', () => {
    mocks.query.mockReturnValue(
      queryResult({ data: { apps: ['cerebrum', 'media', 'inventory'], overlays: [] } })
    );
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/media');
  });

  it('redirects to /settings when no registered app is installed', () => {
    mocks.query.mockReturnValue(queryResult({ data: { apps: ['unknown'], overlays: [] } }));
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/settings');
  });
});
