import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactElement } from 'react';

import type {
  ConnectionsListForItemResponses,
  DocumentsListForItemResponses,
  ItemsGetResponses,
  LocationsGetPathResponses,
  PaperlessStatusResponses,
  PhotosListForItemResponses,
} from '../inventory-api/types.gen';

const {
  itemsGetMock,
  itemsDeleteMock,
  connectionsListForItemMock,
  connectionsDisconnectMock,
  photosListForItemMock,
  photosReorderMock,
  locationsGetPathMock,
  documentsListForItemMock,
  documentsUnlinkMock,
  paperlessStatusMock,
} = vi.hoisted(() => ({
  itemsGetMock: vi.fn(),
  itemsDeleteMock: vi.fn(),
  connectionsListForItemMock: vi.fn(),
  connectionsDisconnectMock: vi.fn(),
  photosListForItemMock: vi.fn(),
  photosReorderMock: vi.fn(),
  locationsGetPathMock: vi.fn(),
  documentsListForItemMock: vi.fn(),
  documentsUnlinkMock: vi.fn(),
  paperlessStatusMock: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  itemsGet: (...args: unknown[]) => itemsGetMock(...args),
  itemsDelete: (...args: unknown[]) => itemsDeleteMock(...args),
  connectionsListForItem: (...args: unknown[]) => connectionsListForItemMock(...args),
  connectionsDisconnect: (...args: unknown[]) => connectionsDisconnectMock(...args),
  photosListForItem: (...args: unknown[]) => photosListForItemMock(...args),
  photosReorder: (...args: unknown[]) => photosReorderMock(...args),
  locationsGetPath: (...args: unknown[]) => locationsGetPathMock(...args),
  documentsListForItem: (...args: unknown[]) => documentsListForItemMock(...args),
  documentsUnlink: (...args: unknown[]) => documentsUnlinkMock(...args),
  paperlessStatus: (...args: unknown[]) => paperlessStatusMock(...args),
}));

vi.mock('../components/ConnectDialog', () => ({
  ConnectDialog: () => <button>Connect</button>,
}));
vi.mock('../components/ConnectionTracePanel', () => ({
  ConnectionTracePanel: () => <div data-testid="trace-panel" />,
}));
vi.mock('../components/LinkDocumentDialog', () => ({
  LinkDocumentDialog: () => <button>Link Document</button>,
}));
vi.mock('../components/ConnectionGraph', () => ({
  ConnectionGraph: () => <div data-testid="connection-graph" />,
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content" dangerouslySetInnerHTML={{ __html: children }} />
  ),
}));

vi.mock('rehype-sanitize', () => ({
  default: {},
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ItemDetailPage } from './ItemDetailPage';

type Item = ItemsGetResponses[200]['data'];
type ItemConnection = ConnectionsListForItemResponses[200]['data'][number];
type LocationNode = LocationsGetPathResponses[200]['data'][number];
type InventoryDocument = DocumentsListForItemResponses[200]['data'][number];

type SdkSuccess<T> = { data: T; error: undefined };
type SdkFailure = { data: undefined; error: { message: string }; response: { status: number } };

function ok<T>(data: T): SdkSuccess<T> {
  return { data, error: undefined };
}

function fail(message: string, status: number): SdkFailure {
  return { data: undefined, error: { message }, response: { status } };
}

function itemEnvelope(item: Item): ItemsGetResponses[200] {
  return { data: item };
}

function connectionsEnvelope(connections: ItemConnection[]): ConnectionsListForItemResponses[200] {
  return {
    data: connections,
    pagination: { total: connections.length, limit: 20, offset: 0, hasMore: false },
  };
}

function photosEnvelope(total: number): PhotosListForItemResponses[200] {
  return {
    data: [],
    pagination: { total, limit: 20, offset: 0, hasMore: false },
  };
}

function locationPathEnvelope(nodes: LocationNode[]): LocationsGetPathResponses[200] {
  return { data: nodes };
}

function paperlessEnvelope(
  status: PaperlessStatusResponses[200]['data']
): PaperlessStatusResponses[200] {
  return { data: status };
}

function documentsEnvelope(docs: InventoryDocument[]): DocumentsListForItemResponses[200] {
  return {
    data: docs,
    pagination: { total: docs.length, limit: 20, offset: 0, hasMore: false },
  };
}

function renderWithProviders(ui: ReactElement, path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/inventory/items/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderAtRoute(path: string) {
  return renderWithProviders(<ItemDetailPage />, path);
}

const baseItem: Item = {
  id: 'item-1',
  itemName: 'MacBook Pro',
  brand: 'Apple',
  model: 'M3 Max',
  itemId: null,
  room: 'Office',
  location: 'Desk',
  type: 'Electronics',
  condition: 'Excellent',
  inUse: true,
  deductible: false,
  purchaseDate: '2025-06-15',
  warrantyExpires: null,
  purchasePrice: null,
  replacementValue: 4500,
  resaleValue: 3000,
  purchaseTransactionId: null,
  purchasedFromId: null,
  purchasedFromName: null,
  assetId: 'ASSET-001',
  notes: null,
  locationId: 'loc-3',
  lastEditedTime: '2026-01-01T00:00:00Z',
};

function mockItemById(items: Record<string, Item>): void {
  itemsGetMock.mockImplementation(async (arg: { path: { id: string } }) => {
    const item = items[arg.path.id];
    if (!item) return fail('Not found', 404);
    return ok(itemEnvelope(item));
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  itemsGetMock.mockImplementation(async () => ok(itemEnvelope(baseItem)));
  connectionsListForItemMock.mockImplementation(async () => ok(connectionsEnvelope([])));
  photosListForItemMock.mockImplementation(async () => ok(photosEnvelope(0)));
  locationsGetPathMock.mockImplementation(async () =>
    ok(
      locationPathEnvelope([
        { id: 'loc-1', name: 'Home', parentId: null, sortOrder: 0 },
        { id: 'loc-2', name: 'Office', parentId: 'loc-1', sortOrder: 0 },
        { id: 'loc-3', name: 'Desk', parentId: 'loc-2', sortOrder: 0 },
      ])
    )
  );
  itemsDeleteMock.mockImplementation(async () => ok({ message: 'deleted' }));
  connectionsDisconnectMock.mockImplementation(async () => ok({ message: 'disconnected' }));
  photosReorderMock.mockImplementation(async () => ok({ data: [], message: 'reordered' }));
  documentsListForItemMock.mockImplementation(async () => ok(documentsEnvelope([])));
  documentsUnlinkMock.mockImplementation(async () => ok({ message: 'unlinked' }));
  paperlessStatusMock.mockImplementation(async () =>
    ok(paperlessEnvelope({ configured: false, available: false, baseUrl: null }))
  );
});

describe('ItemDetailPage', () => {
  describe('Edit button navigation (#2406)', () => {
    it('renders Edit as a link pointing to the edit route', async () => {
      renderAtRoute('/inventory/items/item-1');
      const editLink = await screen.findByRole('link', { name: /edit/i });
      expect(editLink).toBeInTheDocument();
      expect(editLink).toHaveAttribute('href', '/inventory/items/item-1/edit');
    });
  });

  describe('metadata rendering', () => {
    it('renders item name and brand/model', async () => {
      renderAtRoute('/inventory/items/item-1');
      expect((await screen.findAllByText('MacBook Pro')).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Apple/)).toBeInTheDocument();
      expect(screen.getByText(/M3 Max/)).toBeInTheDocument();
    });

    it('renders all metadata fields', async () => {
      renderAtRoute('/inventory/items/item-1');
      expect((await screen.findAllByText('Electronics')).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Excellent')).toBeInTheDocument();
      expect(screen.getAllByText('Office').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('ASSET-001')).toBeInTheDocument();
      expect(screen.getByText('In Use')).toBeInTheDocument();
      expect(screen.getByText('$4,500')).toBeInTheDocument();
    });

    it('omits null metadata fields', async () => {
      itemsGetMock.mockImplementation(async () =>
        ok(
          itemEnvelope({
            ...baseItem,
            brand: null,
            model: null,
            type: null,
            condition: null,
            room: null,
            assetId: null,
            purchaseDate: null,
            replacementValue: null,
          })
        )
      );
      renderAtRoute('/inventory/items/item-1');
      expect((await screen.findAllByText('MacBook Pro')).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Electronics')).not.toBeInTheDocument();
      expect(screen.queryByText('Excellent')).not.toBeInTheDocument();
      expect(screen.queryByText('ASSET-001')).not.toBeInTheDocument();
    });
  });

  describe('404 page', () => {
    it('renders error for non-existent item', async () => {
      itemsGetMock.mockImplementation(async () => fail('Not found', 404));
      renderAtRoute('/inventory/items/nonexistent');
      expect(await screen.findByText('Item not found')).toBeInTheDocument();
      expect(screen.getByText("This item doesn't exist.")).toBeInTheDocument();
      expect(screen.getByText('Back to inventory')).toBeInTheDocument();
    });
  });

  describe('delete with AlertDialog', () => {
    it('shows delete button', async () => {
      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('opens confirmation dialog with item name and counts', async () => {
      connectionsListForItemMock.mockImplementation(async () =>
        ok(
          connectionsEnvelope([
            { id: 1, itemAId: 'item-1', itemBId: 'item-2', createdAt: '2026-01-01T00:00:00Z' },
            { id: 2, itemAId: 'item-1', itemBId: 'item-3', createdAt: '2026-01-01T00:00:00Z' },
          ])
        )
      );
      photosListForItemMock.mockImplementation(async () => ok(photosEnvelope(3)));

      renderAtRoute('/inventory/items/item-1');
      fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

      expect(screen.getByText('Delete MacBook Pro?')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText(/2 connections/)).toBeInTheDocument());
      expect(screen.getByText(/3 photos/)).toBeInTheDocument();
    });

    it('calls delete mutation on confirm', async () => {
      renderAtRoute('/inventory/items/item-1');
      fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

      const confirmButtons = screen.getAllByRole('button', { name: /delete/i });
      const confirmButton = confirmButtons.at(-1)!;
      fireEvent.click(confirmButton);

      await waitFor(() => expect(itemsDeleteMock).toHaveBeenCalledWith({ path: { id: 'item-1' } }));
    });

    it('closes dialog on cancel', async () => {
      renderAtRoute('/inventory/items/item-1');
      fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
      expect(screen.getByText('Delete MacBook Pro?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText('Delete MacBook Pro?')).not.toBeInTheDocument();
    });
  });

  describe('location breadcrumb', () => {
    it('renders breadcrumb path with clickable segments', async () => {
      renderAtRoute('/inventory/items/item-1');
      const breadcrumb = await screen.findByTestId('location-breadcrumb');
      expect(breadcrumb).toBeInTheDocument();

      expect(await screen.findByRole('link', { name: 'Home' })).toHaveAttribute(
        'href',
        '/inventory?location=loc-1'
      );
      expect(screen.getByRole('link', { name: 'Office' })).toHaveAttribute(
        'href',
        '/inventory?location=loc-2'
      );
      expect(screen.getByRole('link', { name: 'Desk' })).toHaveAttribute(
        'href',
        '/inventory?location=loc-3'
      );
    });

    it("shows 'No location assigned' when locationId is null", async () => {
      itemsGetMock.mockImplementation(async () =>
        ok(itemEnvelope({ ...baseItem, locationId: null }))
      );
      locationsGetPathMock.mockImplementation(async () => ok(locationPathEnvelope([])));

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('No location assigned')).toBeInTheDocument();
    });
  });

  describe('notes markdown rendering', () => {
    it('renders notes as markdown', async () => {
      itemsGetMock.mockImplementation(async () =>
        ok(itemEnvelope({ ...baseItem, notes: '**Bold** and _italic_' }))
      );

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('Notes')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    });

    it('hides notes section when notes is null', async () => {
      renderAtRoute('/inventory/items/item-1');
      await screen.findAllByText('MacBook Pro');
      expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    });
  });

  describe('connections section', () => {
    const connectedItemA: Item = {
      ...baseItem,
      id: 'item-2',
      itemName: 'USB-C Hub',
      brand: 'CalDigit',
      model: 'TS4',
    };
    const connectedItemB: Item = {
      ...baseItem,
      id: 'item-3',
      itemName: 'Monitor',
      brand: 'Dell',
      model: 'U2723QE',
    };

    function setupWithConnections() {
      mockItemById({
        'item-1': baseItem,
        'item-2': connectedItemA,
        'item-3': connectedItemB,
      });

      connectionsListForItemMock.mockImplementation(async () =>
        ok(
          connectionsEnvelope([
            { id: 1, itemAId: 'item-1', itemBId: 'item-2', createdAt: '2026-01-01T00:00:00Z' },
            { id: 2, itemAId: 'item-3', itemBId: 'item-1', createdAt: '2026-01-01T00:00:00Z' },
          ])
        )
      );
    }

    it('renders connected items with names and brands', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      expect(await screen.findByText('USB-C Hub')).toBeInTheDocument();
      expect(screen.getByText('CalDigit')).toBeInTheDocument();
      expect(screen.getByText('Monitor')).toBeInTheDocument();
      expect(screen.getByText('Dell')).toBeInTheDocument();
    });

    it('renders connected item links navigating to item detail', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      const hubLink = (await screen.findByText('USB-C Hub')).closest('a');
      expect(hubLink).toHaveAttribute('href', '/inventory/items/item-2');

      const monitorLink = screen.getByText('Monitor').closest('a');
      expect(monitorLink).toHaveAttribute('href', '/inventory/items/item-3');
    });

    it('shows Connection Chain section only when connections exist', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      expect(await screen.findByText('Connection Chain')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view graph/i })).toBeInTheDocument();
    });

    it('hides Connection Chain section when no connections', async () => {
      renderAtRoute('/inventory/items/item-1');
      await screen.findByText('Connected Items');
      expect(screen.queryByText('Connection Chain')).not.toBeInTheDocument();
    });

    it('toggles between trace panel and graph view', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      expect(await screen.findByTestId('trace-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('connection-graph')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /view graph/i }));
      expect(screen.getByTestId('connection-graph')).toBeInTheDocument();
      expect(screen.queryByTestId('trace-panel')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /hide graph/i }));
      expect(screen.getByTestId('trace-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('connection-graph')).not.toBeInTheDocument();
    });

    it('shows empty state when no connected items', async () => {
      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('No connected items yet.')).toBeInTheDocument();
    });

    it('renders disconnect button for each connection', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      await screen.findByText('USB-C Hub');
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i });
      expect(disconnectButtons).toHaveLength(2);
    });

    it('calls disconnect mutation when clicking disconnect', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      await screen.findByText('USB-C Hub');
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButtons[0]!);

      const confirmButton = screen.getByRole('button', { name: /^Disconnect$/i });
      fireEvent.click(confirmButton);

      await waitFor(() =>
        expect(connectionsDisconnectMock).toHaveBeenCalledWith({
          query: { itemAId: 'item-1', itemBId: 'item-2' },
        })
      );
    });

    it('disconnect dialog title includes the connected item name', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      await screen.findByText('USB-C Hub');
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButtons[0]!);

      expect(screen.getByText('Disconnect USB-C Hub?')).toBeInTheDocument();
    });

    it('disconnect dialog does not fire mutation without confirmation', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      await screen.findByText('USB-C Hub');
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButtons[0]!);

      expect(connectionsDisconnectMock).not.toHaveBeenCalled();
    });

    it('disconnect dialog cancel closes without firing mutation', async () => {
      setupWithConnections();
      renderAtRoute('/inventory/items/item-1');

      await screen.findByText('USB-C Hub');
      const disconnectButtons = screen.getAllByRole('button', { name: /disconnect/i });
      fireEvent.click(disconnectButtons[0]!);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(connectionsDisconnectMock).not.toHaveBeenCalled();
      expect(screen.queryByText('Disconnect USB-C Hub?')).not.toBeInTheDocument();
    });

    it('renders AssetIdBadge and TypeBadge for connected items with known values', async () => {
      mockItemById({
        'item-1': baseItem,
        'item-2': { ...connectedItemA, assetId: 'HUB-022', type: 'Electronics' },
        'item-3': { ...connectedItemB, assetId: 'MON-010', type: 'Furniture' },
      });

      connectionsListForItemMock.mockImplementation(async () =>
        ok(
          connectionsEnvelope([
            { id: 1, itemAId: 'item-1', itemBId: 'item-2', createdAt: '2026-01-01T00:00:00Z' },
            { id: 2, itemAId: 'item-3', itemBId: 'item-1', createdAt: '2026-01-01T00:00:00Z' },
          ])
        )
      );

      renderAtRoute('/inventory/items/item-1');

      expect(await screen.findByText('HUB-022')).toBeInTheDocument();
      expect(screen.getByText('MON-010')).toBeInTheDocument();
      expect(screen.getAllByText('Electronics').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Furniture')).toBeInTheDocument();
    });

    it('renders Connected Items heading with icon', async () => {
      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('Connected Items')).toBeInTheDocument();
    });
  });

  describe('documents section', () => {
    it('hides documents section when paperless is not configured', async () => {
      paperlessStatusMock.mockImplementation(async () =>
        ok(paperlessEnvelope({ configured: false, available: false, baseUrl: null }))
      );

      renderAtRoute('/inventory/items/item-1');
      await screen.findAllByText('MacBook Pro');
      await waitFor(() => expect(paperlessStatusMock).toHaveBeenCalled());
      const headings = screen.queryAllByText('Documents');
      expect(headings).toHaveLength(0);
    });

    it('renders document cards with thumbnail images', async () => {
      paperlessStatusMock.mockImplementation(async () =>
        ok(
          paperlessEnvelope({
            configured: true,
            available: true,
            baseUrl: 'https://paperless.example.com',
          })
        )
      );

      documentsListForItemMock.mockImplementation(async () =>
        ok(
          documentsEnvelope([
            {
              id: 1,
              itemId: 'item-1',
              paperlessDocumentId: 42,
              documentType: 'receipt',
              title: 'MacBook Receipt',
              createdAt: '2026-01-15T00:00:00Z',
            },
          ])
        )
      );

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('MacBook Receipt')).toBeInTheDocument();

      const thumbnail = screen.getByAltText('Document thumbnail');
      expect(thumbnail).toHaveAttribute('src', '/inventory/documents/42/thumbnail');
    });

    it('renders View in Paperless link when baseUrl available', async () => {
      paperlessStatusMock.mockImplementation(async () =>
        ok(
          paperlessEnvelope({
            configured: true,
            available: true,
            baseUrl: 'https://paperless.example.com',
          })
        )
      );

      documentsListForItemMock.mockImplementation(async () =>
        ok(
          documentsEnvelope([
            {
              id: 1,
              itemId: 'item-1',
              paperlessDocumentId: 42,
              documentType: 'receipt',
              title: 'Receipt',
              createdAt: '2026-01-15T00:00:00Z',
            },
          ])
        )
      );

      renderAtRoute('/inventory/items/item-1');
      const link = await screen.findByLabelText('View in Paperless');
      expect(link).toHaveAttribute('href', 'https://paperless.example.com/documents/42/details');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('shows skeleton while documents are loading', async () => {
      paperlessStatusMock.mockImplementation(async () =>
        ok(
          paperlessEnvelope({
            configured: true,
            available: true,
            baseUrl: 'https://paperless.example.com',
          })
        )
      );

      documentsListForItemMock.mockImplementation(
        () =>
          new Promise(() => undefined) as Promise<SdkSuccess<DocumentsListForItemResponses[200]>>
      );

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('Documents')).toBeInTheDocument();
    });

    it('shows empty state when no documents linked', async () => {
      paperlessStatusMock.mockImplementation(async () =>
        ok(
          paperlessEnvelope({
            configured: true,
            available: true,
            baseUrl: 'https://paperless.example.com',
          })
        )
      );

      documentsListForItemMock.mockImplementation(async () => ok(documentsEnvelope([])));

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('No documents linked yet.')).toBeInTheDocument();
    });
  });

  describe('purchase link section', () => {
    it('shows transaction link when purchaseTransactionId set', async () => {
      itemsGetMock.mockImplementation(async () =>
        ok(itemEnvelope({ ...baseItem, purchaseTransactionId: 'txn-123' }))
      );

      renderAtRoute('/inventory/items/item-1');
      const link = await screen.findByRole('link', { name: /view transaction/i });
      expect(link).toHaveAttribute('href', '/finance/transactions/txn-123');
    });

    it('shows entity name when purchasedFromId set', async () => {
      itemsGetMock.mockImplementation(async () =>
        ok(
          itemEnvelope({ ...baseItem, purchasedFromId: 'entity-1', purchasedFromName: 'JB Hi-Fi' })
        )
      );

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByText('JB Hi-Fi')).toBeInTheDocument();
    });

    it('hides section when both fields are null', async () => {
      renderAtRoute('/inventory/items/item-1');
      await screen.findAllByText('MacBook Pro');
      expect(screen.queryByTestId('purchase-link-section')).not.toBeInTheDocument();
    });

    it('shows both transaction link and entity name', async () => {
      itemsGetMock.mockImplementation(async () =>
        ok(
          itemEnvelope({
            ...baseItem,
            purchaseTransactionId: 'txn-123',
            purchasedFromId: 'entity-1',
            purchasedFromName: 'Apple Store',
          })
        )
      );

      renderAtRoute('/inventory/items/item-1');
      expect(await screen.findByRole('link', { name: /view transaction/i })).toBeInTheDocument();
      expect(screen.getByText('Apple Store')).toBeInTheDocument();
    });
  });
});
