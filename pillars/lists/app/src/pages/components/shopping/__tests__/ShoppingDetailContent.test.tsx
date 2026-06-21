import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';

import type { ListItemRow, ListRow } from '../../../detail/types.js';

const sdkMocks = {
  listGet: vi.fn(),
  listUpdate: vi.fn(),
  listArchive: vi.fn(),
  listUnarchive: vi.fn(),
  listDelete: vi.fn(),
  itemsAdd: vi.fn(),
  itemsCheck: vi.fn(),
  itemsUncheck: vi.fn(),
  itemsUpdate: vi.fn(),
  itemsRemove: vi.fn(),
  itemsReorder: vi.fn(),
  itemsUncheckAll: vi.fn(),
  itemsRemoveChecked: vi.fn(),
};

vi.mock('../../../../lists-api/index.js', () => ({
  listGet: (...args: unknown[]) => sdkMocks.listGet(...args),
  listUpdate: (...args: unknown[]) => sdkMocks.listUpdate(...args),
  listArchive: (...args: unknown[]) => sdkMocks.listArchive(...args),
  listUnarchive: (...args: unknown[]) => sdkMocks.listUnarchive(...args),
  listDelete: (...args: unknown[]) => sdkMocks.listDelete(...args),
  itemsAdd: (...args: unknown[]) => sdkMocks.itemsAdd(...args),
  itemsCheck: (...args: unknown[]) => sdkMocks.itemsCheck(...args),
  itemsUncheck: (...args: unknown[]) => sdkMocks.itemsUncheck(...args),
  itemsUpdate: (...args: unknown[]) => sdkMocks.itemsUpdate(...args),
  itemsRemove: (...args: unknown[]) => sdkMocks.itemsRemove(...args),
  itemsReorder: (...args: unknown[]) => sdkMocks.itemsReorder(...args),
  itemsUncheckAll: (...args: unknown[]) => sdkMocks.itemsUncheckAll(...args),
  itemsRemoveChecked: (...args: unknown[]) => sdkMocks.itemsRemoveChecked(...args),
}));

vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { ListDetailPage } from '../../../ListDetailPage.js';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeList(overrides: Partial<ListRow> = {}): ListRow {
  return {
    id: 7,
    name: 'Weekend shop',
    kind: 'shopping',
    ownerApp: 'user',
    archivedAt: null,
    createdAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ListItemRow> = {}): ListItemRow {
  return {
    id: 1,
    listId: 7,
    position: 0,
    label: 'Apples',
    qty: 2,
    unit: 'kg',
    refKind: 'free',
    refId: null,
    checked: 0,
    checkedAt: null,
    dueAt: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function setListGet(payload: { list: ListRow; items: ListItemRow[] } | null) {
  sdkMocks.listGet.mockImplementation(async () => ok(payload));
}

function mountAt(listId: number, children: ReactElement) {
  return (
    <MemoryRouter initialEntries={[`/lists/${listId}`]}>
      <Routes>
        <Route path="/lists/:id" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['lists'],
      defaultNS: 'lists',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { lists: enAULists } },
    });
    return instance;
  }, []);
  const qc = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
    []
  );
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

beforeEach(() => {
  Object.values(sdkMocks).forEach((fn) => fn.mockReset());
  sdkMocks.listUpdate.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.listArchive.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.listUnarchive.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.listDelete.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.itemsAdd.mockImplementation(async () => ok({ id: 99, position: 5 }));
  sdkMocks.itemsCheck.mockImplementation(async () =>
    ok({ ok: true as const, checkedAt: '2026-06-10T00:00:00Z' })
  );
  sdkMocks.itemsUncheck.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.itemsUpdate.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.itemsRemove.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.itemsReorder.mockImplementation(async () => ok({ ok: true as const }));
  sdkMocks.itemsUncheckAll.mockImplementation(async () => ok({ ok: true as const, count: 2 }));
  sdkMocks.itemsRemoveChecked.mockImplementation(async () =>
    ok({ ok: true as const, removedCount: 2 })
  );
});

describe('PRD-141 — ShoppingDetailContent', () => {
  it('renders the sort dropdown + caption + bulk buttons for kind=shopping', async () => {
    setListGet({
      list: makeList(),
      items: [
        makeItem(),
        makeItem({ id: 2, label: 'Bread', checked: 1, checkedAt: '2026-06-09T00:00:00Z' }),
      ],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await waitFor(() =>
      expect(screen.getAllByTestId('shopping-sort-dropdown').length).toBeGreaterThan(0)
    );
    expect(screen.getByTestId('shopping-caption')).toHaveTextContent(/2 items.*1 checked/i);
    expect(screen.getByRole('button', { name: 'Uncheck all' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear checked' })).not.toBeDisabled();
  });

  it('disables Uncheck all + Clear checked when nothing is checked', async () => {
    setListGet({ list: makeList(), items: [makeItem()] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await screen.findByRole('button', { name: 'Uncheck all' });
    expect(screen.getByRole('button', { name: 'Uncheck all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear checked' })).toBeDisabled();
  });

  it('confirms uncheck-all and fires the mutation', async () => {
    setListGet({
      list: makeList(),
      items: [makeItem({ checked: 1, checkedAt: '2026-06-09T00:00:00Z' })],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: 'Uncheck all' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /^uncheck all$/i }));
    await waitFor(() =>
      expect(sdkMocks.itemsUncheckAll).toHaveBeenCalledWith(
        expect.objectContaining({ path: { listId: 7 } })
      )
    );
  });

  it('confirms clear-checked and fires the mutation', async () => {
    setListGet({
      list: makeList(),
      items: [makeItem({ checked: 1, checkedAt: '2026-06-09T00:00:00Z' })],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: 'Clear checked' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove checked/i }));
    await waitFor(() =>
      expect(sdkMocks.itemsRemoveChecked).toHaveBeenCalledWith(
        expect.objectContaining({ path: { listId: 7 } })
      )
    );
  });

  it('changing sort to "unchecked-first" puts checked items at the bottom', async () => {
    setListGet({
      list: makeList(),
      items: [
        makeItem({ id: 1, label: 'Apples', position: 0, checked: 1 }),
        makeItem({ id: 2, label: 'Bread', position: 1, checked: 0 }),
      ],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    const select = (await screen.findAllByTestId('shopping-sort-dropdown'))[0];
    if (!select) throw new Error('sort dropdown missing');
    await userEvent.selectOptions(select, 'unchecked-first');
    const ids = screen
      .getAllByTestId(/^shopping-item-/)
      .map((node) => node.getAttribute('data-testid'));
    expect(ids[0]).toBe('shopping-item-2');
    expect(ids[1]).toBe('shopping-item-1');
  });

  it('renders qty/unit always — dash for null', async () => {
    setListGet({
      list: makeList(),
      items: [makeItem({ qty: null, unit: null, label: 'Eggs' })],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(await screen.findByTestId('qty-unit')).toHaveTextContent('—');
  });

  it('renders notes as the sub-line content', async () => {
    setListGet({
      list: makeList(),
      items: [makeItem({ notes: 'From Brownies, Pancakes' })],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(await screen.findByText('From Brownies, Pancakes')).toBeInTheDocument();
  });

  it('submits via ShoppingAddForm with [qty][unit][label] order', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.type(await screen.findByLabelText('Qty'), '3');
    await userEvent.type(screen.getByLabelText('Unit'), 'kg');
    await userEvent.type(screen.getByLabelText('Item'), 'Onions');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(sdkMocks.itemsAdd).toHaveBeenCalled());
    expect((screen.getByLabelText('Qty') as HTMLInputElement).value).toBe('');
  });
});
