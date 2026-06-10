import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';

import type { ListItemRow, ListRow } from '../../../detail/types.js';

interface BulkCalls {
  uncheckAll: ReturnType<typeof vi.fn>;
  removeChecked: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
const bulk: BulkCalls = {
  uncheckAll: vi.fn(),
  removeChecked: vi.fn(),
  update: vi.fn(),
};
const mockGet = vi.fn();

let cachedData: { list: ListRow; items: ListItemRow[] } | null = null;

vi.mock('@pops/api-client', () => {
  const mkMutation = (impl: (args: unknown) => unknown) => ({
    useMutation: () => ({
      mutate: (args: unknown, opts?: { onSuccess?: () => void }) => {
        impl(args);
        opts?.onSuccess?.();
      },
      mutateAsync: async (args: unknown) => impl(args),
      isPending: false,
      error: null,
    }),
  });
  return {
    trpc: {
      useUtils: () => ({
        lists: {
          list: {
            get: {
              invalidate: vi.fn(),
              getData: () => cachedData,
              setData: (_input: unknown, data: typeof cachedData) => {
                cachedData = data;
              },
            },
          },
        },
      }),
      lists: {
        list: {
          get: { useQuery: (input: unknown) => mockGet(input) },
          update: mkMutation((args) => {
            bulk.update(args);
            return { ok: true };
          }),
          archive: mkMutation(() => ({ ok: true })),
          unarchive: mkMutation(() => ({ ok: true })),
          delete: mkMutation(() => ({ ok: true })),
        },
        items: {
          add: mkMutation(() => ({ id: 99, position: 5 })),
          check: mkMutation(() => ({ ok: true, checkedAt: '2026-06-10T00:00:00Z' })),
          uncheck: mkMutation(() => ({ ok: true })),
          update: mkMutation(() => ({ ok: true })),
          remove: mkMutation(() => ({ ok: true })),
          reorder: mkMutation(() => ({ ok: true })),
          uncheckAll: mkMutation((args) => {
            bulk.uncheckAll(args);
            return { ok: true, count: 2 };
          }),
          removeChecked: mkMutation((args) => {
            bulk.removeChecked(args);
            return { ok: true, removedCount: 2 };
          }),
        },
      },
    },
  };
});

vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { ListDetailPage } from '../../../ListDetailPage.js';

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
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

beforeEach(() => {
  bulk.uncheckAll.mockReset();
  bulk.removeChecked.mockReset();
  bulk.update.mockReset();
  mockGet.mockReset();
  cachedData = null;
});

describe('PRD-141 — ShoppingDetailContent', () => {
  it('renders the sort dropdown + caption + bulk buttons for kind=shopping', () => {
    const data = {
      list: makeList(),
      items: [
        makeItem(),
        makeItem({ id: 2, label: 'Bread', checked: 1, checkedAt: '2026-06-09T00:00:00Z' }),
      ],
    };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getAllByTestId('shopping-sort-dropdown').length).toBeGreaterThan(0);
    expect(screen.getByTestId('shopping-caption')).toHaveTextContent(/2 items.*1 checked/i);
    expect(screen.getByRole('button', { name: 'Uncheck all' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear checked' })).not.toBeDisabled();
  });

  it('disables Uncheck all + Clear checked when nothing is checked', () => {
    const data = { list: makeList(), items: [makeItem()] };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByRole('button', { name: 'Uncheck all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear checked' })).toBeDisabled();
  });

  it('confirms uncheck-all and fires the mutation', async () => {
    const data = {
      list: makeList(),
      items: [makeItem({ checked: 1, checkedAt: '2026-06-09T00:00:00Z' })],
    };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: 'Uncheck all' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /^uncheck all$/i }));
    expect(bulk.uncheckAll).toHaveBeenCalledWith({ listId: 7 });
  });

  it('confirms clear-checked and fires the mutation', async () => {
    const data = {
      list: makeList(),
      items: [makeItem({ checked: 1, checkedAt: '2026-06-09T00:00:00Z' })],
    };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: 'Clear checked' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove checked/i }));
    expect(bulk.removeChecked).toHaveBeenCalledWith({ listId: 7 });
  });

  it('changing sort to "unchecked-first" puts checked items at the bottom', async () => {
    const data = {
      list: makeList(),
      items: [
        makeItem({ id: 1, label: 'Apples', position: 0, checked: 1 }),
        makeItem({ id: 2, label: 'Bread', position: 1, checked: 0 }),
      ],
    };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    const select = screen.getAllByTestId('shopping-sort-dropdown')[0];
    if (!select) throw new Error('sort dropdown missing');
    await userEvent.selectOptions(select, 'unchecked-first');
    const ids = screen
      .getAllByTestId(/^shopping-item-/)
      .map((node) => node.getAttribute('data-testid'));
    expect(ids[0]).toBe('shopping-item-2');
    expect(ids[1]).toBe('shopping-item-1');
  });

  it('renders qty/unit always — dash for null', () => {
    const data = {
      list: makeList(),
      items: [makeItem({ qty: null, unit: null, label: 'Eggs' })],
    };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByTestId('qty-unit')).toHaveTextContent('—');
  });

  it('renders notes as the sub-line content', () => {
    const data = {
      list: makeList(),
      items: [makeItem({ notes: 'From Brownies, Pancakes' })],
    };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByText('From Brownies, Pancakes')).toBeInTheDocument();
  });

  it('submits via ShoppingAddForm with [qty][unit][label] order', async () => {
    const data = { list: makeList(), items: [] };
    cachedData = data;
    mockGet.mockReturnValue({ isLoading: false, data, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.type(screen.getByLabelText('Qty'), '3');
    await userEvent.type(screen.getByLabelText('Unit'), 'kg');
    await userEvent.type(screen.getByLabelText('Item'), 'Onions');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    // The add form clears its inputs on success; qty regains focus.
    expect((screen.getByLabelText('Qty') as HTMLInputElement).value).toBe('');
  });
});
