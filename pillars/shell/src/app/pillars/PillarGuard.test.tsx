/**
 * Tests for the per-route pillar guard (ADR-026 P3).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { PillarGuard } from './PillarGuard';
import { PillarStatusProvider } from './PillarStatusProvider';

import type { PillarBootSnapshot } from './types';

function renderWithSnapshot(pillarId: string, snapshot: PillarBootSnapshot) {
  return render(
    <PillarStatusProvider snapshot={snapshot}>
      <PillarGuard pillarId={pillarId}>
        <div data-testid="children">module content</div>
      </PillarGuard>
    </PillarStatusProvider>
  );
}

describe('PillarGuard', () => {
  it('renders the children when the owning pillar is healthy', () => {
    renderWithSnapshot('food', { entries: [], health: { food: 'healthy' } });
    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByText('pillarUnavailableTitle')).not.toBeInTheDocument();
  });

  it('renders the placeholder when the owning pillar is unavailable', () => {
    renderWithSnapshot('food', { entries: [], health: { food: 'unavailable' } });
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
    expect(screen.getByText('pillarUnavailableTitle')).toBeInTheDocument();
  });

  it('renders the children for an unknown pillar (boot fetch pending or failed)', () => {
    // The shell prefers an optimistic render over flashing placeholders during
    // a slow / failed boot. `'unknown'` falls through to the route subtree.
    renderWithSnapshot('food', { entries: [], health: {} });
    expect(screen.getByTestId('children')).toBeInTheDocument();
  });
});
