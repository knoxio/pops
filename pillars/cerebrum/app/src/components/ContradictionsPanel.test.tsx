/**
 * Smoke tests for ContradictionsPanel.
 *
 * Verifies the panel renders the conflict summary, both excerpts, and the
 * source-engram links returned by `POST /nudges/contradictions`. The panel
 * drives the generated cerebrum SDK through React Query, so the SDK module
 * is mocked and renders are wrapped in a `QueryClientProvider`.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const sdk = vi.hoisted(() => ({
  nudgesContradictions: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

import { ContradictionsPanel } from './ContradictionsPanel';

function renderPanel() {
  return render(
    withQueryClient(
      <MemoryRouter>
        <ContradictionsPanel />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContradictionsPanel', () => {
  it('renders a loading state while the query is in flight', () => {
    sdk.nudgesContradictions.mockReturnValue(new Promise(() => undefined));
    renderPanel();
    expect(screen.getByTestId('contradictions-loading')).toBeInTheDocument();
  });

  it('renders an error state when the query fails', async () => {
    sdk.nudgesContradictions.mockResolvedValue({
      error: { message: 'boom' },
      response: { status: 500 },
    });
    renderPanel();
    expect(await screen.findByTestId('contradictions-error')).toBeInTheDocument();
  });

  it('renders the empty state when there are no contradictions', async () => {
    sdk.nudgesContradictions.mockResolvedValue({ data: { contradictions: [], total: 0 } });
    renderPanel();
    expect(await screen.findByTestId('contradictions-empty')).toBeInTheDocument();
  });

  it('renders excerpts from both sides and links to the source engrams', async () => {
    sdk.nudgesContradictions.mockResolvedValue({
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
    });

    renderPanel();

    expect(await screen.findByText('A allows Friday deploys, B forbids them.')).toBeInTheDocument();
    expect(screen.getByText('Friday deploys are fine.')).toBeInTheDocument();
    expect(screen.getByText('Never deploy on Fridays.')).toBeInTheDocument();

    const linkA = screen.getByRole('link', { name: 'eng_a' });
    const linkB = screen.getByRole('link', { name: 'eng_b' });
    expect(linkA).toHaveAttribute('href', '/cerebrum/engrams/eng_a');
    expect(linkB).toHaveAttribute('href', '/cerebrum/engrams/eng_b');
  });
});
