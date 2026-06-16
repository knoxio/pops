import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAULists from '../../../../../apps/pops-shell/src/i18n/locales/en-AU/lists.json';

import type { ListListAggregateResponses } from '../../lists-api/types.gen';
import type { ListIndexItemView } from '../lists-index/useListsIndexQuery';

const listListAggregateMock = vi.fn();
const listCreateMock = vi.fn();

vi.mock('../../lists-api/index.js', () => ({
  listListAggregate: (...args: unknown[]) => listListAggregateMock(...args),
  listCreate: (...args: unknown[]) => listCreateMock(...args),
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

type AggregatePayload = NonNullable<ListListAggregateResponses[200]>;

function mockSuccessAggregate(items: ListIndexItemView[]): void {
  listListAggregateMock.mockImplementation(async () => ({
    data: { items } satisfies AggregatePayload,
    error: undefined,
  }));
}

function mockAggregateError(message: string): void {
  listListAggregateMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
  }));
}

function mockNeverResolvingAggregate(): void {
  listListAggregateMock.mockImplementation(
    () => new Promise(() => undefined) as Promise<{ data: AggregatePayload; error: undefined }>
  );
}

function mockSuccessCreate(id: number): void {
  listCreateMock.mockImplementation(async () => ({
    data: { id },
    error: undefined,
  }));
}

function mockCreateError(message: string): void {
  listCreateMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
  }));
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
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function lastAggregateQuery(): Record<string, unknown> | undefined {
  const lastCall = listListAggregateMock.mock.lastCall;
  if (!lastCall) return undefined;
  const [args] = lastCall as [{ query?: Record<string, unknown> }];
  return args?.query;
}

beforeEach(() => {
  listListAggregateMock.mockReset();
  listCreateMock.mockReset();
});

describe('PRD-140 part B — ListsIndexPage', () => {
  it('renders the heading and the new-list CTA', async () => {
    mockSuccessAggregate([]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await waitFor(() => expect(listListAggregateMock).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: /^Lists$/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+ new list/i })).toHaveAttribute(
      'href',
      expect.stringContaining('new=1')
    );
  });

  it('renders a row per list with name and kind chip', async () => {
    mockSuccessAggregate([buildItem(), buildItem({ id: 2, name: 'Camping', kind: 'packing' })]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    const grocLink = await screen.findByRole('link', { name: /weekly groceries/i });
    const campLink = screen.getByRole('link', { name: /camping/i });
    expect(grocLink).toHaveAttribute('href', '/lists/1');
    expect(campLink).toHaveAttribute('href', '/lists/2');
    expect(grocLink.querySelector('[data-kind="shopping"]')).not.toBeNull();
    expect(campLink.querySelector('[data-kind="packing"]')).not.toBeNull();
  });

  it('shows the empty state when no lists exist', async () => {
    mockSuccessAggregate([]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(await screen.findByText(/no lists yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create your first list/i })).toBeInTheDocument();
  });

  it('shows the loading state while the query resolves', () => {
    mockNeverResolvingAggregate();
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading lists/i);
  });

  it('renders the error state with a retry button', async () => {
    mockAggregateError('boom');
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load lists/i);
    const callsBefore = listListAggregateMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() =>
      expect(listListAggregateMock.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it('passes filter state into the query when the user toggles a chip OFF', async () => {
    mockSuccessAggregate([buildItem()]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await waitFor(() => expect(listListAggregateMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: /^Packing$/ }));
    await waitFor(() => {
      const q = lastAggregateQuery();
      expect(q?.kinds).toEqual(expect.arrayContaining(['shopping', 'todo', 'generic']));
      expect(q?.kinds).not.toContain('packing');
    });
  });

  it('collapses the "all kinds selected" default to undefined on the wire', async () => {
    mockSuccessAggregate([buildItem()]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await waitFor(() => expect(listListAggregateMock).toHaveBeenCalled());
    expect(lastAggregateQuery()?.kinds).toBeUndefined();
  });

  it('toggles the archive filter through the query', async () => {
    mockSuccessAggregate([]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await waitFor(() => expect(listListAggregateMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('checkbox', { name: /show archived/i }));
    await waitFor(() => expect(lastAggregateQuery()?.includeArchived).toBe(true));
  });

  it('changes sort through the query', async () => {
    mockSuccessAggregate([]);
    render(
      <Wrapper>
        <ListsIndexPage />
      </Wrapper>
    );
    await waitFor(() => expect(listListAggregateMock).toHaveBeenCalled());
    await userEvent.selectOptions(screen.getByRole('combobox'), 'name');
    await waitFor(() => expect(lastAggregateQuery()?.sort).toBe('name'));
  });

  it('opens the create modal when navigated with ?new=1', async () => {
    mockSuccessAggregate([]);
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^New list$/i })).toBeInTheDocument();
  });

  it('submits the create mutation with the trimmed name + kind', async () => {
    mockSuccessAggregate([]);
    mockSuccessCreate(42);
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    const nameInput = await screen.findByLabelText(/^name$/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '  Camping list  ');
    await userEvent.click(screen.getByRole('button', { name: /^Create$/i }));
    await waitFor(() =>
      expect(listCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: { name: 'Camping list', kind: 'shopping' } })
      )
    );
  });

  it('auto-fills the shopping placeholder on focus when the field is empty', async () => {
    mockSuccessAggregate([]);
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    const nameInput = (await screen.findByLabelText(/^name$/i)) as HTMLInputElement;
    fireEvent.focus(nameInput);
    await waitFor(() => expect(nameInput.value).toMatch(/^Shopping list — \d{4}-\d{2}-\d{2}$/));
  });

  it('does not throw when the create mutation reports an error', async () => {
    mockSuccessAggregate([]);
    mockCreateError('boom');
    render(
      <Wrapper initialEntries={['/lists?new=1']}>
        <ListsIndexPage />
      </Wrapper>
    );
    const nameInput = await screen.findByLabelText(/^name$/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Bad list');
    await expect(
      (async () => {
        await userEvent.click(screen.getByRole('button', { name: /^Create$/i }));
        await waitFor(() => expect(listCreateMock).toHaveBeenCalled());
      })()
    ).resolves.not.toThrow();
  });
});
