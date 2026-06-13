/**
 * Smoke tests for ContradictionsPanel (PRD-084 US-03, #2580).
 *
 * Verifies the panel renders the conflict summary, both excerpts, and the
 * source-engram links returned by `cerebrum.nudges.contradictions`.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

interface ContradictionsResult {
  contradictions: Array<{
    id: string;
    createdAt: string;
    status: string;
    priority: string;
    title: string;
    engramA: string;
    engramB: string;
    excerptA: string;
    excerptB: string;
    conflict: string;
  }>;
  total: number;
}

let queryResult: { data: ContradictionsResult | undefined; isLoading: boolean; isError: boolean } =
  {
    data: undefined,
    isLoading: false,
    isError: false,
  };

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: () => queryResult,
}));

import { ContradictionsPanel } from './ContradictionsPanel';

function renderPanel() {
  return render(
    <MemoryRouter>
      <ContradictionsPanel />
    </MemoryRouter>
  );
}

describe('ContradictionsPanel', () => {
  it('renders a loading state while the query is in flight', () => {
    queryResult = { data: undefined, isLoading: true, isError: false };
    renderPanel();
    expect(screen.getByTestId('contradictions-loading')).toBeInTheDocument();
  });

  it('renders an error state when the query fails', () => {
    queryResult = { data: undefined, isLoading: false, isError: true };
    renderPanel();
    expect(screen.getByTestId('contradictions-error')).toBeInTheDocument();
  });

  it('renders the empty state when there are no contradictions', () => {
    queryResult = {
      data: { contradictions: [], total: 0 },
      isLoading: false,
      isError: false,
    };
    renderPanel();
    expect(screen.getByTestId('contradictions-empty')).toBeInTheDocument();
  });

  it('renders excerpts from both sides and links to the source engrams', () => {
    queryResult = {
      data: {
        contradictions: [
          {
            id: 'nudge_1',
            createdAt: '2026-04-27T10:00:00Z',
            status: 'pending',
            priority: 'high',
            title: 'Contradiction detected: "deploys"',
            engramA: 'eng_a',
            engramB: 'eng_b',
            excerptA: 'Friday deploys are fine.',
            excerptB: 'Never deploy on Fridays.',
            conflict: 'A allows Friday deploys, B forbids them.',
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    };

    renderPanel();

    expect(screen.getByText('A allows Friday deploys, B forbids them.')).toBeInTheDocument();
    expect(screen.getByText('Friday deploys are fine.')).toBeInTheDocument();
    expect(screen.getByText('Never deploy on Fridays.')).toBeInTheDocument();

    const linkA = screen.getByRole('link', { name: 'eng_a' });
    const linkB = screen.getByRole('link', { name: 'eng_b' });
    expect(linkA).toHaveAttribute('href', '/cerebrum/engrams/eng_a');
    expect(linkB).toHaveAttribute('href', '/cerebrum/engrams/eng_b');
  });
});
