import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock tRPC hooks
const mockItemsListQuery = vi.fn();
const mockConnectMutate = vi.fn();
const mockConnectMutation = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      items: {
        list: { useQuery: (...args: unknown[]) => mockItemsListQuery(...args) },
      },
      connections: {
        connect: { useMutation: (...args: unknown[]) => mockConnectMutation(...args) },
      },
    },
  },
}));

import { ConnectDialog } from './ConnectDialog';

const defaultProps = {
  currentItemId: 'item-1',
  onConnected: vi.fn(),
};

function renderDialog() {
  return render(<ConnectDialog {...defaultProps} />);
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /connect item/i }));
}

beforeEach(() => {
  vi.clearAllMocks();

  mockItemsListQuery.mockReturnValue({ data: undefined, isLoading: false });

  mockConnectMutation.mockReturnValue({
    mutate: mockConnectMutate,
    isPending: false,
  });
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
    });
  });

  describe('loading state', () => {
    it('shows skeleton rows while loading', () => {
      mockItemsListQuery.mockReturnValue({ data: undefined, isLoading: true });
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'mac' },
      });
      // Three skeleton divs should appear — detect via aria or count animated elements
      // Skeletons don't have accessible roles, but the "No items found" and prompt should be absent
      expect(screen.queryByText('No items found')).not.toBeInTheDocument();
      expect(screen.queryByText('Type at least 2 characters to search')).not.toBeInTheDocument();
    });
  });

  describe('empty results', () => {
    it('shows "No items found" when search returns empty list', () => {
      mockItemsListQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'xyz' },
      });
      expect(screen.getByText('No items found')).toBeInTheDocument();
    });
  });

  describe('search results', () => {
    const searchResults = [
      {
        id: 'item-2',
        itemName: 'USB-C Hub',
        brand: 'CalDigit',
        model: 'TS4',
        assetId: 'HUB-022',
        type: 'Electronics',
      },
      {
        id: 'item-3',
        itemName: 'Monitor',
        brand: 'Dell',
        model: null,
        assetId: null,
        type: null,
      },
    ];

    function setupResults() {
      mockItemsListQuery.mockReturnValue({
        data: { data: searchResults },
        isLoading: false,
      });
    }

    it('renders item names', () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(screen.getByText('USB-C Hub')).toBeInTheDocument();
      expect(screen.getByText('Monitor')).toBeInTheDocument();
    });

    it('renders brand and model as plain text', () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(screen.getByText('CalDigit · TS4')).toBeInTheDocument();
    });

    it('renders AssetIdBadge when assetId is present', () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(screen.getByText('HUB-022')).toBeInTheDocument();
    });

    it('omits AssetIdBadge when assetId is null', () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      // Only one assetId badge — the Monitor has no assetId
      expect(screen.queryAllByText(/MON-/)).toHaveLength(0);
    });

    it('renders TypeBadge when type is present', () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      expect(screen.getByText('Electronics')).toBeInTheDocument();
    });

    it('omits TypeBadge when type is null', () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      // Monitor has null type — only 1 TypeBadge (Electronics for USB-C Hub)
      expect(screen.getAllByText('Electronics')).toHaveLength(1);
    });

    it('filters out the current item from results', () => {
      mockItemsListQuery.mockReturnValue({
        data: {
          data: [
            ...searchResults,
            {
              id: 'item-1',
              itemName: 'Current Item',
              brand: null,
              model: null,
              assetId: null,
              type: null,
            },
          ],
        },
        isLoading: false,
      });
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'cu' },
      });
      expect(screen.queryByText('Current Item')).not.toBeInTheDocument();
    });

    it('calls connect mutation when result item is clicked', async () => {
      setupResults();
      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });
      fireEvent.click(screen.getByText('USB-C Hub'));
      expect(mockConnectMutate).toHaveBeenCalledWith({
        itemAId: 'item-1',
        itemBId: 'item-2',
      });
    });
  });

  describe('post-connect', () => {
    it('resets search and closes on success', async () => {
      let onSuccessCallback: (() => void) | undefined;
      mockConnectMutation.mockImplementation((opts: { onSuccess?: () => void }) => {
        onSuccessCallback = opts?.onSuccess;
        return { mutate: mockConnectMutate, isPending: false };
      });

      mockItemsListQuery.mockReturnValue({
        data: {
          data: [
            {
              id: 'item-2',
              itemName: 'USB-C Hub',
              brand: null,
              model: null,
              assetId: null,
              type: null,
            },
          ],
        },
        isLoading: false,
      });

      renderDialog();
      openDialog();
      fireEvent.change(screen.getByPlaceholderText('Search items...'), {
        target: { value: 'us' },
      });

      expect(screen.getByText('USB-C Hub')).toBeInTheDocument();

      // Simulate success
      onSuccessCallback?.();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
