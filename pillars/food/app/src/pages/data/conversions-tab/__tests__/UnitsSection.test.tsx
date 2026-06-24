/**
 * Mocks the generated food SDK (src/food-api) so the section renders against
 * controlled data without a live registry-mounted backend.
 *
 * See pillars/food/docs/prds/conversion-table.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const conversionsListUnitsMock = vi.hoisted(() => vi.fn());
const conversionsCreateUnitMock = vi.hoisted(() => vi.fn());
const conversionsUpdateUnitMock = vi.hoisted(() => vi.fn());
const conversionsDeleteUnitMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  conversionsListUnits: conversionsListUnitsMock,
  conversionsCreateUnit: conversionsCreateUnitMock,
  conversionsUpdateUnit: conversionsUpdateUnitMock,
  conversionsDeleteUnit: conversionsDeleteUnitMock,
}));

import { UnitsSection } from '../UnitsSection';

import type { UnitConversionRow } from '../types';

function withClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

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
  conversionsListUnitsMock.mockResolvedValue({ data: { items: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  seedList([]);
  conversionsCreateUnitMock.mockResolvedValue({ data: { data: row({ id: 99 }) } });
  conversionsUpdateUnitMock.mockResolvedValue({ data: { data: row({ id: 99 }) } });
  conversionsDeleteUnitMock.mockResolvedValue({ data: { ok: true } });
});

describe('UnitsSection', () => {
  it('renders the table with the seeded badge for seeded rows', async () => {
    seedList([
      row({ id: 1, fromUnit: 'cup', toUnit: 'ml', ratio: 240, seeded: true }),
      row({ id: 2, fromUnit: 'oz', toUnit: 'g', ratio: 28.35, seeded: false }),
    ]);
    render(withClient(<UnitsSection />));
    const cupRow = await screen.findByTestId('unit-row-1');
    expect(within(cupRow).getByText(/seeded/i)).toBeInTheDocument();
    const ozRow = screen.getByTestId('unit-row-2');
    expect(within(ozRow).queryByText(/seeded/i)).not.toBeInTheDocument();
  });

  it('disables the delete button on seeded rows', async () => {
    seedList([row({ id: 1, seeded: true })]);
    render(withClient(<UnitsSection />));
    const cupRow = await screen.findByTestId('unit-row-1');
    const deleteBtn = within(cupRow).getByRole('button', { name: /reseed to restore/i });
    expect(deleteBtn).toBeDisabled();
  });

  it('passes the search text into the query input', async () => {
    seedList([]);
    render(withClient(<UnitsSection />));
    const search = screen.getByLabelText(/search/i);
    await userEvent.type(search, 'tbsp');
    await waitFor(() => {
      const lastCall = conversionsListUnitsMock.mock.lastCall?.[0] as
        | { query?: { search?: string } }
        | undefined;
      expect(lastCall?.query?.search).toBe('tbsp');
    });
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedList([]);
    render(withClient(<UnitsSection />));
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/from unit/i), 'cup');
    await userEvent.type(within(dialog).getByLabelText(/^ratio$/i), '240');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(conversionsCreateUnitMock).toHaveBeenCalledWith({
        body: { fromUnit: 'cup', toUnit: 'ml', ratio: 240, notes: undefined },
      })
    );
  });

  it('keeps the create dialog open until the mutation resolves, then closes it', async () => {
    seedList([]);
    let resolveCreate: ((value: { data: { data: UnitConversionRow } }) => void) | undefined;
    conversionsCreateUnitMock.mockReturnValue(
      new Promise<{ data: { data: UnitConversionRow } }>((resolve) => {
        resolveCreate = resolve;
      })
    );
    render(withClient(<UnitsSection />));
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/from unit/i), 'cup');
    await userEvent.type(within(dialog).getByLabelText(/^ratio$/i), '240');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    await waitFor(() => expect(conversionsCreateUnitMock).toHaveBeenCalledTimes(1));
    // Dialog must stay open while the create mutation is in flight.
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
    resolveCreate?.({ data: { data: row({ id: 1 }) } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('surfaces a server-side error in the dialog', async () => {
    seedList([]);
    conversionsCreateUnitMock.mockResolvedValue({
      error: { message: 'duplicate' },
      response: { status: 409 },
    });
    render(withClient(<UnitsSection />));
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/from unit/i), 'cup');
    await userEvent.type(within(dialog).getByLabelText(/^ratio$/i), '240');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('treats the delete result with ok:false reason:"seeded" as a seeded-protected error', async () => {
    seedList([row({ id: 9, seeded: false })]);
    conversionsDeleteUnitMock.mockResolvedValue({ data: { ok: false, reason: 'seeded' } });
    render(withClient(<UnitsSection />));
    const r = await screen.findByTestId('unit-row-9');
    await userEvent.click(within(r).getByRole('button', { name: /delete/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/seeded/i);
  });

  it('clears the inline error when the create dialog closes', async () => {
    seedList([]);
    conversionsCreateUnitMock.mockResolvedValue({
      error: { message: 'oops' },
      response: { status: 400 },
    });
    render(withClient(<UnitsSection />));
    await userEvent.click(screen.getByRole('button', { name: /add conversion/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/from unit/i), 'cup');
    await userEvent.type(within(dialog).getByLabelText(/^ratio$/i), '240');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
