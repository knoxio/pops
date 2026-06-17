import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

import type { ReflexWithStatus } from '../reflex/types';

const sdk = vi.hoisted(() => ({
  reflexList: vi.fn(),
  reflexEnable: vi.fn(),
  reflexDisable: vi.fn(),
  reflexTest: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

import { ReflexListPage } from './ReflexListPage';

function buildReflex(overrides: Partial<ReflexWithStatus> = {}): ReflexWithStatus {
  return {
    name: 'consolidate-notes',
    description: 'Consolidates similar notes',
    enabled: true,
    trigger: { type: 'event', event: 'engram.created' },
    action: { type: 'glia', verb: 'consolidate' },
    lastExecutionAt: '2026-05-11T01:00:00Z',
    nextFireTime: null,
    executionCount: 3,
    ...overrides,
  };
}

function renderPage() {
  return render(
    withQueryClient(
      <MemoryRouter>
        <ReflexListPage />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.reflexEnable.mockResolvedValue({ data: { ok: true } });
  sdk.reflexDisable.mockResolvedValue({ data: { ok: true } });
  sdk.reflexTest.mockResolvedValue({ data: { ok: true } });
});

describe('ReflexListPage', () => {
  it('renders the loading skeleton while the list query is in flight', () => {
    sdk.reflexList.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByTestId('reflex-loading')).toBeInTheDocument();
  });

  it('renders the empty state when no reflexes are configured', async () => {
    sdk.reflexList.mockResolvedValue({ data: { reflexes: [] } });
    renderPage();
    expect(await screen.findByText('No reflexes configured')).toBeInTheDocument();
  });

  it('renders an error state with retry when the query fails', async () => {
    sdk.reflexList.mockResolvedValue({ error: { message: 'boom' }, response: { status: 500 } });
    renderPage();
    expect(await screen.findByTestId('reflex-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(sdk.reflexList).toHaveBeenCalledTimes(2));
  });

  it('lists reflex rows and fires the test mutation on demand', async () => {
    sdk.reflexList.mockResolvedValue({
      data: {
        reflexes: [buildReflex(), buildReflex({ name: 'nightly-summary', enabled: false })],
      },
    });
    renderPage();
    expect(await screen.findAllByTestId('reflex-row')).toHaveLength(2);
    const targetRow = screen.getByText('consolidate-notes').closest('[data-testid="reflex-row"]');
    if (!(targetRow instanceof HTMLElement)) {
      throw new Error('Expected reflex-row for consolidate-notes');
    }
    await userEvent.click(within(targetRow).getByRole('button', { name: /fire/i }));
    await waitFor(() =>
      expect(sdk.reflexTest).toHaveBeenCalledWith({ path: { name: 'consolidate-notes' } })
    );
  });

  it('toggles enable and disable mutations from the row switch', async () => {
    sdk.reflexList.mockResolvedValue({
      data: {
        reflexes: [
          buildReflex({ name: 'a', enabled: true }),
          buildReflex({ name: 'b', enabled: false }),
        ],
      },
    });
    renderPage();
    await screen.findByText('a');
    const rowA = screen.getByText('a').closest('[data-testid="reflex-row"]');
    const rowB = screen.getByText('b').closest('[data-testid="reflex-row"]');
    if (!(rowA instanceof HTMLElement) || !(rowB instanceof HTMLElement)) {
      throw new Error('Expected reflex-row elements for a and b');
    }
    await userEvent.click(within(rowA).getByRole('switch'));
    await waitFor(() => expect(sdk.reflexDisable).toHaveBeenCalledWith({ path: { name: 'a' } }));
    await userEvent.click(within(rowB).getByRole('switch'));
    await waitFor(() => expect(sdk.reflexEnable).toHaveBeenCalledWith({ path: { name: 'b' } }));
  });
});
