/**
 * PRD-123 Phase C — UnitsSection smoke tests.
 *
 * Mocks `@pops/pillar-sdk` so the section renders against controlled data
 * and asserts:
 *   - the seeded badge + disabled delete render for seeded rows
 *   - the search input feeds into the listUnits query input
 *   - the create dialog submits via the mutation
 *   - server errors propagate to the dialog alert
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnitsSection } from '../UnitsSection';

import type { UnitConversionRow } from '../types';

interface MutationOpts {
  onSuccess?: (result: { ok: boolean; reason?: string }) => void;
  onError?: (err: unknown) => void;
}

vi.mock('@pops/pillar-sdk/client', () => {
  class PillarCallError extends Error {
    pillarId: string;
    result: { kind: string; pillar: string; message?: string };
    constructor(pillarId: string, result: { kind: string; pillar: string; message?: string }) {
      super(result.message ?? result.kind);
      this.pillarId = pillarId;
      this.result = result;
    }
  }
  return {
    PillarCallError,
    isNotFound: (err: unknown) => err instanceof PillarCallError && err.result.kind === 'not-found',
    isConflict: (err: unknown) => err instanceof PillarCallError && err.result.kind === 'conflict',
    isBadRequest: (err: unknown) =>
      err instanceof PillarCallError && err.result.kind === 'bad-request',
  };
});

const { PillarCallError: MockPillarCallError } = await import('@pops/pillar-sdk/client');

const mockListQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidate = vi.fn();
let createOpts: MutationOpts = {};
let deleteOpts: MutationOpts = {};

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'conversions.listUnits') return mockListQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[], opts: MutationOpts) => {
    const key = path.join('.');
    if (key === 'conversions.createUnit') {
      createOpts = opts;
      return { mutate: mockCreateMutate, mutateAsync: vi.fn(), isPending: false };
    }
    if (key === 'conversions.updateUnit') {
      return { mutate: mockUpdateMutate, mutateAsync: vi.fn(), isPending: false };
    }
    if (key === 'conversions.deleteUnit') {
      deleteOpts = opts;
      return { mutate: mockDeleteMutate, mutateAsync: vi.fn(), isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: mockInvalidate,
  }),
}));

function row(overrides: Partial<UnitConversionRow> & { id: number }): UnitConversionRow {
  return {
    fromUnit: 'cup',
    toUnit: 'ml',
    ratio: 240,
    notes: null,
    seeded: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function seedList(rows: readonly UnitConversionRow[]): void {
  mockListQuery.mockReturnValue({ data: { items: rows }, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  createOpts = {};
  deleteOpts = {};
});

describe('PRD-123 Phase C — UnitsSection', () => {
  it('renders the table with the seeded badge for seeded rows', () => {
    seedList([
      row({ id: 1, fromUnit: 'cup', toUnit: 'ml', ratio: 240, seeded: true }),
      row({ id: 2, fromUnit: 'oz', toUnit: 'g', ratio: 28.35, seeded: false }),
    ]);
    render(<UnitsSection />);
    const cupRow = screen.getByTestId('unit-row-1');
    expect(within(cupRow).getByText(/seeded/i)).toBeInTheDocument();
    const ozRow = screen.getByTestId('unit-row-2');
    expect(within(ozRow).queryByText(/seeded/i)).not.toBeInTheDocument();
  });

  it('disables the delete button on seeded rows', () => {
    seedList([row({ id: 1, seeded: true })]);
    render(<UnitsSection />);
    const cupRow = screen.getByTestId('unit-row-1');
    // Disabled button has aria-label = seeded tooltip (overrides text content).
    const deleteBtn = within(cupRow).getByRole('button', { name: /reseed to restore/i });
    expect(deleteBtn).toBeDisabled();
  });

  it('passes the search text into the query input', async () => {
    seedList([]);
    render(<UnitsSection />);
    const search = screen.getByLabelText(/search/i);
    await userEvent.type(search, 'tbsp');
    const lastCall = mockListQuery.mock.lastCall?.[0] as { search?: string } | undefined;
    expect(lastCall?.search).toBe('tbsp');
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedList([]);
    render(<UnitsSection />);
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/from unit/i), 'cup');
    await userEvent.type(within(dialog).getByLabelText(/^ratio$/i), '240');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    expect(mockCreateMutate).toHaveBeenCalledWith(
      { fromUnit: 'cup', toUnit: 'ml', ratio: 240, notes: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('keeps the create dialog open until the mutation onSuccess fires', async () => {
    seedList([]);
    render(<UnitsSection />);
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/from unit/i), 'cup');
    await userEvent.type(within(dialog).getByLabelText(/^ratio$/i), '240');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    // The mutation has not resolved yet — dialog must still be open.
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
    // Now simulate the server confirming success.
    const submitCall = mockCreateMutate.mock.lastCall;
    act(() => submitCall?.[1]?.onSuccess?.());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('surfaces a server-side error in the dialog', async () => {
    seedList([]);
    render(<UnitsSection />);
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    act(() =>
      createOpts.onError?.(
        new MockPillarCallError('food', { kind: 'conflict', pillar: 'food', message: 'duplicate' })
      )
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('treats the delete result with ok:false reason:"seeded" as a seeded-protected error', async () => {
    seedList([row({ id: 9, seeded: false })]);
    render(<UnitsSection />);
    act(() => deleteOpts.onSuccess?.({ ok: false, reason: 'seeded' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/seeded/i);
  });

  it('clears the inline error when the create dialog closes', async () => {
    seedList([]);
    render(<UnitsSection />);
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    act(() =>
      createOpts.onError?.(
        new MockPillarCallError('food', { kind: 'bad-request', pillar: 'food', message: 'oops' })
      )
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
