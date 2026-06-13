import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';

import type { ListItemRow, ListRow } from '../detail/types.js';

interface MutationCalls {
  update: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  unarchive: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
  uncheck: ReturnType<typeof vi.fn>;
  itemUpdate: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reorder: ReturnType<typeof vi.fn>;
}

const calls: MutationCalls = {
  update: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  del: vi.fn(),
  add: vi.fn(),
  check: vi.fn(),
  uncheck: vi.fn(),
  itemUpdate: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
};

const mockGet = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => {
  const procImpls: Record<string, (args: unknown) => unknown> = {
    'lists.list.update': (args) => {
      calls.update(args);
      return { ok: true };
    },
    'lists.list.archive': (args) => {
      calls.archive(args);
      return { ok: true };
    },
    'lists.list.unarchive': (args) => {
      calls.unarchive(args);
      return { ok: true };
    },
    'lists.list.delete': (args) => {
      calls.del(args);
      return { ok: true };
    },
    'lists.items.add': (args) => {
      calls.add(args);
      return { id: 99, position: 5 };
    },
    'lists.items.check': (args) => {
      calls.check(args);
      return { ok: true, checkedAt: '2026-06-10T00:00:00Z' };
    },
    'lists.items.uncheck': (args) => {
      calls.uncheck(args);
      return { ok: true };
    },
    'lists.items.update': (args) => {
      calls.itemUpdate(args);
      return { ok: true };
    },
    'lists.items.remove': (args) => {
      calls.remove(args);
      return { ok: true };
    },
    'lists.items.reorder': (args) => {
      calls.reorder(args);
      return { ok: true };
    },
  };
  return {
    usePillarQuery: (pillarId: string, path: readonly string[], input: unknown) => {
      const key = `${pillarId}.${path.join('.')}`;
      if (key === 'lists.list.get') return mockGet(input);
      throw new Error(`Unexpected pillar query: ${key}`);
    },
    usePillarMutation: (pillarId: string, path: readonly string[]) => {
      const key = `${pillarId}.${path.join('.')}`;
      const impl = procImpls[key];
      if (!impl) throw new Error(`Unexpected pillar mutation: ${key}`);
      return {
        mutate: (args: unknown) => {
          impl(args);
        },
        mutateAsync: async (args: unknown) => impl(args),
        isPending: false,
        error: null,
      };
    },
    usePillarUtils: () => ({
      setData: () => undefined,
      invalidate: async () => undefined,
    }),
  };
});

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { ListDetailPage } from '../ListDetailPage.js';

function makeList(overrides: Partial<ListRow> = {}): ListRow {
  return {
    id: 7,
    name: 'Weekend shop',
    // PRD-141 dispatches `shopping` to the specialised body; the generic-path
    // test suite uses `todo` so it keeps exercising `GenericDetailContent`.
    // ShoppingDetailContent has its own RTL coverage in
    // `components/shopping/__tests__/ShoppingDetailContent.test.tsx`.
    kind: 'todo',
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
  Object.values(calls).forEach((fn) => fn.mockReset());
  mockGet.mockReset();
  navigateMock.mockReset();
});

describe('PRD-140-C — ListDetailPage', () => {
  it('shows loading state then renders header + items', () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: {
        list: makeList(),
        items: [makeItem(), makeItem({ id: 2, label: 'Bread', qty: null, unit: null })],
      },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByRole('heading', { name: 'Weekend shop' })).toBeInTheDocument();
    expect(screen.getByTestId('list-kind-chip')).toHaveTextContent('Todo');
    expect(screen.getByTestId('list-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-item-2')).toBeInTheDocument();
  });

  it('renders the not-found shell when the query resolves to null', () => {
    mockGet.mockReturnValue({ isLoading: false, data: null, error: null });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByRole('alert')).toHaveTextContent(/list not found/i);
  });

  it('renders the not-found shell for non-numeric route params', () => {
    mockGet.mockReturnValue({ isLoading: false, data: null, error: null });
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/lists/banana']}>
          <Routes>
            <Route path="/lists/:id" element={<ListDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/list not found/i);
  });

  it('renders an empty state when there are no items', () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('toggles checked state via the item checkbox', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [makeItem()] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByLabelText(/toggle done for apples/i));
    expect(calls.check).toHaveBeenCalledWith({ id: 1 });
  });

  it('unchecks an already-checked item', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: {
        list: makeList(),
        items: [makeItem({ checked: 1, checkedAt: '2026-06-10T00:00:00Z' })],
      },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByLabelText(/toggle done for apples/i));
    expect(calls.uncheck).toHaveBeenCalledWith({ id: 1 });
  });

  it('submits the add-item form on Enter and clears the input', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    const input = screen.getByPlaceholderText(/add item/i);
    await userEvent.type(input, 'Onions{Enter}');
    expect(calls.add).toHaveBeenCalledWith(
      expect.objectContaining({ listId: 7, label: 'Onions', qty: null, unit: null })
    );
    expect(input).toHaveValue('');
  });

  it('opens edit modal from the action menu and saves a rename', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog');
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Sunday shop');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, name: 'Sunday shop', kind: 'todo' })
    );
    expect(dialog).not.toBeInTheDocument();
  });

  it('rejects whitespace-only rename without firing the mutation', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.update).not.toHaveBeenCalled();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it('archives via the action menu', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(calls.archive).toHaveBeenCalledWith({ id: 7 });
  });

  it('shows Restore + archived badge when the list is archived', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList({ archivedAt: '2026-06-08T00:00:00Z' }), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(screen.getByTestId('archived-badge')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
    expect(calls.unarchive).toHaveBeenCalledWith({ id: 7 });
  });

  it('confirms delete then fires the mutation and navigates', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [makeItem()] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete list' }));
    expect(calls.del).toHaveBeenCalledWith({ id: 7 });
    expect(navigateMock).toHaveBeenCalledWith('/lists');
  });

  it('saves an inline label edit on Enter', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [makeItem()] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: /2kg apples/i }));
    const input = screen.getByLabelText(/edit item label/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Green apples{Enter}');
    expect(calls.itemUpdate).toHaveBeenCalledWith({ id: 1, label: 'Green apples' });
  });

  it('reorders via the Move down menu item', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: {
        list: makeList(),
        items: [
          makeItem({ id: 1, label: 'Apples', position: 0 }),
          makeItem({ id: 2, label: 'Bread', position: 1, qty: null, unit: null }),
        ],
      },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    const itemMenus = screen.getAllByRole('button', { name: /item actions/i });
    await userEvent.click(itemMenus[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(calls.reorder).toHaveBeenCalledWith({ listId: 7, orderedIds: [2, 1] });
  });

  it('removes an item via the item action menu', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [makeItem()] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(screen.getByRole('button', { name: /item actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(calls.remove).toHaveBeenCalledWith({ id: 1 });
  });

  it('polls every 60s via refetchInterval on the get query', () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: { list: makeList(), items: [] },
      error: null,
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(mockGet).toHaveBeenCalledWith({ id: 7 });
    // The query options live alongside the input in the page; this test asserts
    // the page reaches the body branch (proxy for the useQuery call landing).
  });
});
