import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';

import type { ListItemRow, ListRow } from '../detail/types.js';

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
};

vi.mock('../../lists-api/index.js', () => ({
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
}));

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { ListDetailPage } from '../ListDetailPage.js';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeList(overrides: Partial<ListRow> = {}): ListRow {
  return {
    id: 7,
    name: 'Weekend shop',
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
  navigateMock.mockReset();
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
});

describe('PRD-140-C — ListDetailPage', () => {
  it('shows loading state then renders header + items', async () => {
    setListGet({
      list: makeList(),
      items: [makeItem(), makeItem({ id: 2, label: 'Bread', qty: null, unit: null })],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(await screen.findByRole('heading', { name: 'Weekend shop' })).toBeInTheDocument();
    expect(screen.getByTestId('list-kind-chip')).toHaveTextContent('Todo');
    expect(screen.getByTestId('list-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-item-2')).toBeInTheDocument();
  });

  it('renders the not-found shell when the query resolves to null', async () => {
    setListGet(null);
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(await screen.findByRole('alert')).toHaveTextContent(/list not found/i);
  });

  it('renders the not-found shell for non-numeric route params', () => {
    setListGet(null);
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

  it('renders an empty state when there are no items', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument();
  });

  it('toggles checked state via the item checkbox', async () => {
    setListGet({ list: makeList(), items: [makeItem()] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByLabelText(/toggle done for apples/i));
    await waitFor(() =>
      expect(sdkMocks.itemsCheck).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 1 } }))
    );
  });

  it('unchecks an already-checked item', async () => {
    setListGet({
      list: makeList(),
      items: [makeItem({ checked: 1, checkedAt: '2026-06-10T00:00:00Z' })],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByLabelText(/toggle done for apples/i));
    await waitFor(() =>
      expect(sdkMocks.itemsUncheck).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 1 } })
      )
    );
  });

  it('submits the add-item form on Enter and clears the input', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    const input = await screen.findByPlaceholderText(/add item/i);
    await userEvent.type(input, 'Onions{Enter}');
    await waitFor(() =>
      expect(sdkMocks.itemsAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { listId: 7 },
          body: expect.objectContaining({ label: 'Onions', qty: null, unit: null }),
        })
      )
    );
    expect(input).toHaveValue('');
  });

  it('opens edit modal from the action menu and saves a rename', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog');
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Sunday shop');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sdkMocks.listUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 7 },
          body: expect.objectContaining({ name: 'Sunday shop', kind: 'todo' }),
        })
      )
    );
    expect(dialog).not.toBeInTheDocument();
  });

  it('rejects whitespace-only rename without firing the mutation', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(sdkMocks.listUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it('archives via the action menu', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await waitFor(() =>
      expect(sdkMocks.listArchive).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 7 } })
      )
    );
  });

  it('shows Restore + archived badge when the list is archived', async () => {
    setListGet({ list: makeList({ archivedAt: '2026-06-08T00:00:00Z' }), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    expect(await screen.findByTestId('archived-badge')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
    await waitFor(() =>
      expect(sdkMocks.listUnarchive).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 7 } })
      )
    );
  });

  it('confirms delete then fires the mutation and navigates', async () => {
    setListGet({ list: makeList(), items: [makeItem()] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: /list actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete list' }));
    await waitFor(() =>
      expect(sdkMocks.listDelete).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 7 } }))
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/lists'));
  });

  it('saves an inline label edit on Enter', async () => {
    setListGet({ list: makeList(), items: [makeItem()] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: /2kg apples/i }));
    const input = screen.getByLabelText(/edit item label/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Green apples{Enter}');
    await waitFor(() =>
      expect(sdkMocks.itemsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 1 },
          body: expect.objectContaining({ label: 'Green apples' }),
        })
      )
    );
  });

  it('reorders via the Move down menu item', async () => {
    setListGet({
      list: makeList(),
      items: [
        makeItem({ id: 1, label: 'Apples', position: 0 }),
        makeItem({ id: 2, label: 'Bread', position: 1, qty: null, unit: null }),
      ],
    });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    const itemMenus = await screen.findAllByRole('button', { name: /item actions/i });
    await userEvent.click(itemMenus[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() =>
      expect(sdkMocks.itemsReorder).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { listId: 7 },
          body: { orderedIds: [2, 1] },
        })
      )
    );
  });

  it('removes an item via the item action menu', async () => {
    setListGet({ list: makeList(), items: [makeItem()] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await userEvent.click(await screen.findByRole('button', { name: /item actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() =>
      expect(sdkMocks.itemsRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: 1 } })
      )
    );
  });

  it('fetches the detail payload with the listId from the route', async () => {
    setListGet({ list: makeList(), items: [] });
    render(<Wrapper>{mountAt(7, <ListDetailPage />)}</Wrapper>);
    await waitFor(() =>
      expect(sdkMocks.listGet).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 7 } }))
    );
  });
});
