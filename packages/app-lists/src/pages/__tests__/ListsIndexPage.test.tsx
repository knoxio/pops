import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';

import type { ListIndexItemView } from '../lists-index/useListsIndexQuery';

const mockListQuery = vi.fn();
const mockCreateMutate = vi.fn();
let mockOnSuccess: ((res: { id: number }) => void) | undefined;
let mockOnError: ((err: Error) => void) | undefined;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (pillarId: string, path: readonly string[], input: unknown) => {
    const key = `${pillarId}.${path.join('.')}`;
    if (key === 'lists.list.list') return mockListQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    pillarId: string,
    path: readonly string[],
    opts: {
      onSuccess?: (res: { id: number }) => void;
      onError?: (err: Error) => void;
    } = {}
  ) => {
    const key = `${pillarId}.${path.join('.')}`;
    if (key !== 'lists.list.create') {
      throw new Error(`Unexpected pillar mutation: ${key}`);
    }
    mockOnSuccess = opts.onSuccess;
    mockOnError = opts.onError;
    return { mutate: mockCreateMutate, isPending: false };
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ListsIndexPage } from '../ListsIndexPage';

function buildItem(overrides: Partial<ListIndexItemView> = {}): ListIndexItemView {
  return {
    id: 1,
    name: 'Weekly groceries',
    kind: 'shopping',
    ownerApp: 'user',
    itemCount: 5,
    uncheckedCount: 3,
    lastUpdatedAt: '2026-06-09T00:00:00Z',
    archivedAt: null,
    ...overrides,
  };
}

interface QueryResultOpts {
  items?: ListIndexItemView[];
  isLoading?: boolean;
  error?: Error | null;
}

function makeQueryResult({ items = [], isLoading = false, error = null }: QueryResultOpts) {
  return {
    data: { items },
    isLoading,
    error,
    refetch: vi.fn(),
  };
}

const DEFAULT_ENTRIES = ['/lists'];

function Wrapper({
  children,
  initialEntries = DEFAULT_ENTRIES,
}: {
  children: ReactElement;
  initialEntries?: string[];
}): ReactElement {
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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

beforeEach(() => {
  mockListQuery.mockReset();
  mockCreateMutate.mockReset();
  mockOnSuccess = undefined;
  mockOnError = undefined;
});

describe('PRD-140 part B — ListsIndexPage', () => {
  it('renders the heading and the new-list CTA', () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /^Lists$/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+ new list/i })).toHaveAttribute(
      'href',
      expect.stringContaining('new=1')
    );
  });

  it('renders a row per list with name and kind chip', () => {
    mockListQuery.mockReturnValue(
      makeQueryResult({
        items: [buildItem(), buildItem({ id: 2, name: 'Camping', kind: 'packing' })],
      })
    );
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    const grocLink = screen.getByRole('link', { name: /weekly groceries/i });
    const campLink = screen.getByRole('link', { name: /camping/i });
    expect(grocLink).toHaveAttribute('href', '/lists/1');
    expect(campLink).toHaveAttribute('href', '/lists/2');
    // Row-level kind chip uses `data-kind` to disambiguate from the
    // identically-labelled filter chip above.
    expect(grocLink.querySelector('[data-kind="shopping"]')).not.toBeNull();
    expect(campLink.querySelector('[data-kind="packing"]')).not.toBeNull();
  });

  it('shows the empty state when no lists exist', () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(screen.getByText(/no lists yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create your first list/i })).toBeInTheDocument();
  });

  it('shows the loading state while the query resolves', () => {
    mockListQuery.mockReturnValue(makeQueryResult({ isLoading: true }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading lists/i);
  });

  it('renders the error state with a retry button', async () => {
    const refetch = vi.fn();
    mockListQuery.mockReturnValue({
      ...makeQueryResult({ error: new Error('boom') }),
      refetch,
    });
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load lists/i);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('passes filter state into the query when the user toggles a chip OFF', async () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [buildItem()] }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    // Default is "all kinds selected" — clicking Packing deselects it. The
    // hook collapses a full set to `undefined`, but here only 3 of 4 are
    // active so the wire-shape carries the explicit set.
    await userEvent.click(screen.getByRole('button', { name: /^Packing$/ }));
    await waitFor(() =>
      expect(mockListQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kinds: expect.arrayContaining(['shopping', 'todo', 'generic']),
        })
      )
    );
    expect(mockListQuery.mock.lastCall?.[0]?.kinds).not.toContain('packing');
  });

  it('collapses the "all kinds selected" default to undefined on the wire', () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [buildItem()] }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(mockListQuery).toHaveBeenLastCalledWith(expect.objectContaining({ kinds: undefined }));
  });

  it('toggles the archive filter through the query', async () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /show archived/i }));
    await waitFor(() =>
      expect(mockListQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeArchived: true })
      )
    );
  });

  it('changes sort through the query', async () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'name');
    await waitFor(() =>
      expect(mockListQuery).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name' }))
    );
  });

  it('opens the create modal when navigated with ?new=1', () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^New list$/i })).toBeInTheDocument();
  });

  it('submits the create mutation with the trimmed name + kind', async () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    const nameInput = screen.getByLabelText(/^name$/i);
    // Shopping kind auto-fills the placeholder on focus per PRD-140; clear
    // it so the test can drive an explicit value through `userEvent.type`.
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '  Camping list  ');
    await userEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    expect(mockCreateMutate).toHaveBeenCalledWith({ name: 'Camping list', kind: 'shopping' });
  });

  it('auto-fills the shopping placeholder on focus when the field is empty', async () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    // Use `fireEvent.focus` rather than `el.focus()` — the native DOM call
    // doesn't reliably dispatch through React's synthetic event system
    // under jsdom (Radix Dialog's focus management interferes), but
    // `fireEvent.focus` always invokes the React-bound `onFocus` handler.
    // Per PRD-140 §Create modal, `kind='shopping'` + empty name + focus →
    // auto-fill `Shopping list — <yyyy-MM-dd>`.
    fireEvent.focus(nameInput);
    await waitFor(() => expect(nameInput.value).toMatch(/^Shopping list — \d{4}-\d{2}-\d{2}$/));
  });

  it('wires onSuccess so the SDK can invalidate the index cache + the page can navigate', () => {
    // Cache invalidation is owned by `usePillarMutation`'s built-in
    // router-prefix invalidate; the page just needs to register an
    // `onSuccess` that the SDK can chain. This test asserts the wiring is
    // in place (the callback exists and runs without throwing).
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(mockOnSuccess).toBeDefined();
    expect(() => mockOnSuccess?.({ id: 42 })).not.toThrow();
  });

  it('does not throw when the create mutation reports an error', () => {
    mockListQuery.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(() => mockOnError?.(new Error('boom'))).not.toThrow();
  });
});
