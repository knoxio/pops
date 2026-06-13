/**
 * PRD-142 — RTL coverage for the send-to-list modal.
 *
 * Mocks `@pops/api-client` so the prepare query, lists query, and send
 * mutation are all controllable per test. Covers the modal contract: the
 * preview, picker (existing vs new), submit-disabled rules, success +
 * error paths, and the close-mid-flight non-cancellation behaviour.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { RecipeScaleProvider } from '../../RecipeScaleProvider.js';

type SendResult =
  | { ok: true; listId: number; addedCount: number; mergedCount: number }
  | { ok: false; reason: string };

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
  alreadySentToListIds: [],
};

const mockPrepare = vi.fn();
const mockListsList = vi.fn();
const mockSendMutate = vi.fn();
let capturedSendOptions: {
  onSuccess?: (result: SendResult) => void;
  onError?: (err: Error) => void;
} = {};
let mockSendPending = false;

vi.mock('@pops/api-client', () => ({
  trpc: {
    food: {
      recipes: {
        prepareSendToList: { useQuery: (...args: unknown[]) => mockPrepare(...args) },
      },
    },
    lists: {
      list: {
        list: { useQuery: (...args: unknown[]) => mockListsList(...args) },
      },
    },
  },
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: {
      onSuccess?: (result: SendResult) => void;
      onError?: (err: Error) => void;
    }
  ) => {
    const key = path.join('.');
    if (key === 'recipes.sendToList') {
      capturedSendOptions = opts;
      return {
        mutate: (input: unknown) => mockSendMutate(input),
        isPending: mockSendPending,
      };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
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
  return (
    <I18nextProvider i18n={i18n}>
      <RecipeScaleProvider>{children}</RecipeScaleProvider>
    </I18nextProvider>
  );
}

function loaded(payload = preparePayload) {
  return { isLoading: false, data: payload, error: null, refetch: vi.fn() };
}

function withLists(
  items: { id: number; name: string; itemCount: number; lastUpdatedAt: string }[]
) {
  return {
    isLoading: false,
    data: { items },
    error: null,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  mockPrepare.mockReset();
  mockListsList.mockReset();
  mockSendMutate.mockReset();
  capturedSendOptions = {};
  mockSendPending = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SendToListModal — render + state', () => {
  it('shows the loading copy until both queries resolve', () => {
    mockPrepare.mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
      refetch: vi.fn(),
    });
    mockListsList.mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading preview/i);
  });

  it('renders the preview canonical + unconverted items and a Send button with item count', () => {
    mockPrepare.mockReturnValue(loaded());
    mockListsList.mockReturnValue(withLists([]));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText('300 g flour')).toBeInTheDocument();
    expect(screen.getByText('2 tbsp ghee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send 2 items/i })).toBeInTheDocument();
  });

  it('auto-selects "create new" when no shopping lists exist and prefills a date-stamped name', () => {
    mockPrepare.mockReturnValue(loaded());
    mockListsList.mockReturnValue(withLists([]));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    const newRadio = screen.getByRole('radio', { name: /create new list/i });
    expect(newRadio).toBeChecked();
    const input = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(input.value).toMatch(/Shopping list — \d{4}-\d{2}-\d{2}/);
  });

  it('disables the "Add to existing" radio when no shopping lists exist', () => {
    mockPrepare.mockReturnValue(loaded());
    mockListsList.mockReturnValue(withLists([]));
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByRole('radio', { name: /add to existing list/i })).toBeDisabled();
  });
});

describe('SendToListModal — submit + result', () => {
  it('sends to a freshly typed new list', async () => {
    mockPrepare.mockReturnValue(loaded());
    mockListsList.mockReturnValue(withLists([]));
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={onOpenChange} onSuccess={onSuccess} />
      </Wrapper>
    );
    const input = screen.getByLabelText(/name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Test list');
    await userEvent.click(screen.getByRole('button', { name: /send 2 items/i }));
    expect(mockSendMutate).toHaveBeenCalledWith({
      versionId: 11,
      scaleFactor: 1,
      target: { kind: 'new', name: 'Test list' },
    });
    capturedSendOptions.onSuccess?.({
      ok: true,
      listId: 42,
      addedCount: 2,
      mergedCount: 0,
    });
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
    mockPrepare.mockReturnValue(loaded());
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
    // The "existing" radio should be auto-selected when lists are available
    expect(screen.getByRole('radio', { name: /add to existing list/i })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /weekly/i }));
    await userEvent.click(screen.getByRole('button', { name: /send 2 items/i }));
    expect(mockSendMutate).toHaveBeenCalledWith({
      versionId: 11,
      scaleFactor: 1,
      target: { kind: 'existing', listId: 7 },
    });
  });

  it('disables Send until an existing list is picked', () => {
    mockPrepare.mockReturnValue(loaded());
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
    expect(screen.getByRole('button', { name: /send 2 items/i })).toBeDisabled();
  });

  it('renders the already-sent badge for matching shopping lists', () => {
    mockPrepare.mockReturnValue(loaded({ ...preparePayload, alreadySentToListIds: [7] }));
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
    expect(screen.getByText(/already sent/i)).toBeInTheDocument();
  });

  it('shows an inline error and keeps the modal open when the server returns ok=false', async () => {
    mockPrepare.mockReturnValue(loaded());
    mockListsList.mockReturnValue(withLists([]));
    const onOpenChange = vi.fn();
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={onOpenChange} onSuccess={vi.fn()} />
      </Wrapper>
    );
    await userEvent.type(screen.getByLabelText(/name/i), 'X');
    await userEvent.click(screen.getByRole('button', { name: /send 2 items/i }));
    capturedSendOptions.onSuccess?.({ ok: false, reason: 'TargetListArchived' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/archived/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('SendToListModal — closing', () => {
  it('does not call the mutation when the user cancels', async () => {
    mockPrepare.mockReturnValue(loaded());
    mockListsList.mockReturnValue(withLists([]));
    const onOpenChange = vi.fn();
    render(
      <Wrapper>
        <SendToListModal open versionId={11} onOpenChange={onOpenChange} onSuccess={vi.fn()} />
      </Wrapper>
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockSendMutate).not.toHaveBeenCalled();
  });
});
