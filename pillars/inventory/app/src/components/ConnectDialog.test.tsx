import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactElement } from 'react';

import type { ConnectionsConnectResponses, ItemsListResponses } from '../inventory-api/types.gen';

const itemsListMock = vi.hoisted(() => vi.fn());
const connectionsConnectMock = vi.hoisted(() => vi.fn());

vi.mock('../inventory-api/index.js', () => ({
  itemsList: (...args: unknown[]) => itemsListMock(...args),
  connectionsConnect: (...args: unknown[]) => connectionsConnectMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ConnectDialog } from './ConnectDialog';

type ListPayload = NonNullable<ItemsListResponses[200]>;
type ListItem = ListPayload['data'][number];
type ConnectPayload = NonNullable<ConnectionsConnectResponses[201]>;

const defaultProps = {
  currentItemId: 'item-1',
  onConnected: vi.fn(),
};

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderDialog() {
  return renderWithProviders(<ConnectDialog {...defaultProps} />);
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /connect item/i }));
}

function buildItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: 'item-2',
    itemName: 'USB-C Hub',
    brand: 'CalDigit',
    model: 'TS4',
    assetId: 'HUB-022',
    type: 'Electronics',
    condition: null,
    deductible: false,
    inUse: false,
    itemId: null,
    lastEditedTime: '2026-06-09T00:00:00Z',
    location: null,
    locationId: null,
    notes: null,
    purchaseDate: null,
    purchasePrice: null,
    purchaseTransactionId: null,
    purchasedFromId: null,
    purchasedFromName: null,
    replacementValue: null,
    resaleValue: null,
    room: null,
    warrantyExpires: null,
    ...overrides,
  };
}

function mockListSuccess(items: ListItem[]): void {
  itemsListMock.mockImplementation(async () => ({
    data: {
      data: items,
      pagination: { hasMore: false, limit: 10, offset: 0, total: items.length },
      totals: { totalReplacementValue: 0, totalResaleValue: 0 },
    } satisfies ListPayload,
    error: undefined,
  }));
}

function mockListPending(): void {
  itemsListMock.mockImplementation(
    () => new Promise(() => undefined) as Promise<{ data: ListPayload; error: undefined }>
  );
}

function mockConnectSuccess(): void {
  connectionsConnectMock.mockImplementation(
    async () =>
      ({
        data: {
          createdAt: '2026-06-09T00:00:00Z',
          id: 1,
          itemAId: 'item-1',
          itemBId: 'item-2',
        },
        message: 'connected',
      }) satisfies { data: ConnectPayload['data']; message: string }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListSuccess([]);
  mockConnectSuccess();
});

describe('ConnectDialog', () => {
  describe('trigger', () => {
    it('renders the Connect Item trigger button', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: /connect item/i })).toBeInTheDocument();
    });

    it('opens the dialog when trigger is clicked', () => {
      renderDialog();
      openDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Connect Item' })).toBeInTheDocument();
    });
  });

  describe('search prompt', () => {
    it('shows prompt to type at least 2 characters before searching', () => {
      renderDialog();
      openDialog();
      expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();
    });

    it('shows prompt when only 1 character typed', () => {
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), { target: { value: 'a' } });
      expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument();
      expect(itemsListMock).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows skeleton rows while loading', async () => {
      mockListPending();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'mac' },
      });
      await waitFor(() => expect(itemsListMock).toHaveBeenCalled());
      expect(screen.queryByText('No items found')).not.toBeInTheDocument();
      expect(screen.queryByText('Type at least 2 characters to search')).not.toBeInTheDocument();
    });
  });

  describe('empty results', () => {
    it('shows "No items found" when search returns empty list', async () => {
      mockListSuccess([]);
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'xyz' },
      });
      expect(await screen.findByText('No items found')).toBeInTheDocument();
    });
  });

  describe('search results', () => {
    const searchResults: ListItem[] = [
      buildItem({
        id: 'item-2',
        itemName: 'USB-C Hub',
        brand: 'CalDigit',
        model: 'TS4',
        assetId: 'HUB-022',
        type: 'Electronics',
      }),
      buildItem({
        id: 'item-3',
        itemName: 'Monitor',
        brand: 'Dell',
        model: null,
        assetId: null,
        type: null,
      }),
    ];

    function setupResults() {
      mockListSuccess(searchResults);
    }

    it('renders item names', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(await screen.findByText('USB-C Hub')).toBeInTheDocument();
      expect(screen.getByText('Monitor')).toBeInTheDocument();
    });

    it('renders brand and model as plain text', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(await screen.findByText('CalDigit · TS4')).toBeInTheDocument();
    });

    it('renders AssetIdBadge when assetId is present', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(await screen.findByText('HUB-022')).toBeInTheDocument();
    });

    it('omits AssetIdBadge when assetId is null', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      await screen.findByText('USB-C Hub');
      expect(screen.queryAllByText(/MON-/)).toHaveLength(0);
    });

    it('renders TypeBadge when type is present', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(await screen.findByText('Electronics')).toBeInTheDocument();
    });

    it('omits TypeBadge when type is null', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      await screen.findByText('USB-C Hub');
      expect(screen.getAllByText('Electronics')).toHaveLength(1);
    });

    it('filters out the current item from results', async () => {
      mockListSuccess([
        ...searchResults,
        buildItem({
          id: 'item-1',
          itemName: 'Current Item',
          brand: null,
          model: null,
          assetId: null,
          type: null,
        }),
      ]);
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'cu' },
      });
      await screen.findByText('USB-C Hub');
      expect(screen.queryByText('Current Item')).not.toBeInTheDocument();
    });

    it('calls connect mutation when result item is clicked', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      fireEvent.click(await screen.findByText('USB-C Hub'));
      await waitFor(() =>
        expect(connectionsConnectMock).toHaveBeenCalledWith({
          body: { itemAId: 'item-1', itemBId: 'item-2' },
        })
      );
    });
  });

  describe('post-connect', () => {
    it('resets search and closes on success', async () => {
      mockListSuccess([
        buildItem({
          id: 'item-2',
          itemName: 'USB-C Hub',
          brand: null,
          model: null,
          assetId: null,
          type: null,
        }),
      ]);
      mockConnectSuccess();

      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });

      fireEvent.click(await screen.findByText('USB-C Hub'));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(defaultProps.onConnected).toHaveBeenCalled();
    });
  });
});
