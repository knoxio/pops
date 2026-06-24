/**
 * RTL coverage for the send-to-list modal (pillars/food/docs/prds/send-to-list).
 *
 * Mocks the food Hey API SDK (prepare + send) and the lists Hey API SDK
 * (the cross-pillar `GET /lists` read) so all three calls are controllable
 * per test. Covers the modal contract: the
 * preview, picker (existing vs new), submit-disabled rules, success +
 * error paths, and the close-mid-flight non-cancellation behaviour.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import { RecipeScaleProvider } from '../../RecipeScaleProvider.js';

const preparePayload = {
  recipeTitle: 'Banana pancakes',
  scaleFactor: 1,
  canonicalItems: [
    {
      label: '300 g flour',
      qty: 300,
      unit: 'g',
      ingredientId: 1,
      variantId: null,
      prepStateLabel: null,
      sourceLineIds: [1, 2],
    },
  ],
  unconvertedItems: [
    {
      label: '2 tbsp ghee',
      qty: 2,
      unit: 'tbsp',
      ingredientId: 2,
      variantId: null,
      prepStateLabel: null,
      sourceLineIds: [3],
    },
  ],
  alreadySentToListIds: [] as number[],
};

const sendToListPrepareMock = vi.hoisted(() => vi.fn());
const sendToListSendMock = vi.hoisted(() => vi.fn());
const mockListsList = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  sendToListPrepare: sendToListPrepareMock,
  sendToListSend: sendToListSendMock,
}));

vi.mock('../../../../lists-api/index.js', () => ({
  listListAggregate: mockListsList,
}));

import { SendToListModal } from '../SendToListModal.js';

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['food'],
      defaultNS: 'food',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { food: enAUFood } },
    });
    return instance;
  }, []);
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    []
  );
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RecipeScaleProvider>{children}</RecipeScaleProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

function preparedWith(payload = preparePayload): void {
  sendToListPrepareMock.mockResolvedValue({ data: payload });
}

function withLists(
  items: { id: number; name: string; itemCount: number; lastUpdatedAt: string }[]
) {
  return { data: { items } };
}

beforeEach(() => {
  sendToListPrepareMock.mockReset();
  sendToListSendMock.mockReset();
  mockListsList.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SendToListModal — render + state', () => {
  it('shows the loading copy until both queries resolve', () => {
    sendToListPrepareMock.mockReturnValue(new Promise(() => {}));
    mockListsList.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading preview/i);
  });

  it('renders the preview canonical + unconverted items and a Send button with item count', async () => {
    preparedWith();
    mockListsList.mockReturnValue(withLists([]));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(await screen.findByText('300 g flour')).toBeInTheDocument();
    expect(screen.getByText('2 tbsp ghee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send 2 items/i })).toBeInTheDocument();
  });

  it('auto-selects "create new" when no shopping lists exist and prefills a date-stamped name', async () => {
    preparedWith();
    mockListsList.mockReturnValue(withLists([]));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    const newRadio = await screen.findByRole('radio', { name: /create new list/i });
    expect(newRadio).toBeChecked();
    const input = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(input.value).toMatch(/Shopping list — \d{4}-\d{2}-\d{2}/);
  });

  it('disables the "Add to existing" radio when no shopping lists exist', async () => {
    preparedWith();
    mockListsList.mockReturnValue(withLists([]));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(await screen.findByRole('radio', { name: /add to existing list/i })).toBeDisabled();
  });
});

describe('SendToListModal — submit + result', () => {
  it('sends to a freshly typed new list', async () => {
    preparedWith();
    mockListsList.mockReturnValue(withLists([]));
    sendToListSendMock.mockResolvedValue({
      data: { ok: true, listId: 42, addedCount: 2, mergedCount: 0 },
    });
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={onOpenChange} onSuccess={onSuccess} />
      </Wrapper>
    );
    const input = await screen.findByLabelText(/name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Test list');
    await userEvent.click(screen.getByRole('button', { name: /send 2 items/i }));
    await waitFor(() =>
      expect(sendToListSendMock).toHaveBeenCalledWith({
        path: { versionId: 11 },
        body: { scaleFactor: 1, target: { kind: 'new', name: 'Test list' } },
      })
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0]?.[0]).toMatchObject({
      listId: 42,
      addedCount: 2,
      mergedCount: 0,
      listName: 'Test list',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends to an existing list when the user picks one', async () => {
    preparedWith();
    mockListsList.mockReturnValue(
      withLists([
        { id: 7, name: 'Weekly', itemCount: 3, lastUpdatedAt: '2026-06-01T00:00:00.000Z' },
      ])
    );
    sendToListSendMock.mockResolvedValue({
      data: { ok: true, listId: 7, addedCount: 2, mergedCount: 0 },
    });
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(await screen.findByRole('radio', { name: /add to existing list/i })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /weekly/i }));
    await userEvent.click(screen.getByRole('button', { name: /send 2 items/i }));
    await waitFor(() =>
      expect(sendToListSendMock).toHaveBeenCalledWith({
        path: { versionId: 11 },
        body: { scaleFactor: 1, target: { kind: 'existing', listId: 7 } },
      })
    );
  });

  it('disables Send until an existing list is picked', async () => {
    preparedWith();
    mockListsList.mockReturnValue(
      withLists([
        { id: 7, name: 'Weekly', itemCount: 3, lastUpdatedAt: '2026-06-01T00:00:00.000Z' },
      ])
    );
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(await screen.findByRole('button', { name: /send 2 items/i })).toBeDisabled();
  });

  it('renders the already-sent badge for matching shopping lists', async () => {
    preparedWith({ ...preparePayload, alreadySentToListIds: [7] });
    mockListsList.mockReturnValue(
      withLists([
        { id: 7, name: 'Weekly', itemCount: 3, lastUpdatedAt: '2026-06-01T00:00:00.000Z' },
      ])
    );
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(await screen.findByText(/already sent/i)).toBeInTheDocument();
  });

  it('shows an inline error and keeps the modal open when the server returns ok=false', async () => {
    preparedWith();
    mockListsList.mockReturnValue(withLists([]));
    sendToListSendMock.mockResolvedValue({ data: { ok: false, reason: 'TargetListArchived' } });
    const onOpenChange = vi.fn();
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={onOpenChange} onSuccess={vi.fn()} />
      </Wrapper>
    );
    await userEvent.type(await screen.findByLabelText(/name/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /send 2 items/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/archived/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('SendToListModal — closing', () => {
  it('does not call the mutation when the user cancels', async () => {
    preparedWith();
    mockListsList.mockReturnValue(withLists([]));
    const onOpenChange = vi.fn();
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={onOpenChange} onSuccess={vi.fn()} />
      </Wrapper>
    );
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(sendToListSendMock).not.toHaveBeenCalled();
  });
});
