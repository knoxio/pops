import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TraceNode } from '../inventory-api/index.js';
import type { ConnectionsTraceResponses } from '../inventory-api/types.gen';

const connectionsTraceMock = vi.hoisted(() => vi.fn());
const mockNavigate = vi.fn();

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../inventory-api/index.js', () => ({
  connectionsTrace: (...args: unknown[]) => connectionsTraceMock(...args),
}));

vi.mock('@pops/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    AssetIdBadge: ({ assetId }: { assetId: string }) => (
      <span data-testid="asset-id-badge">{assetId}</span>
    ),
    TypeBadge: ({ type }: { type: string }) => <span data-testid="type-badge">{type}</span>,
    Skeleton: ({ className }: { className?: string }) => (
      <div data-testid="skeleton" className={className} />
    ),
    Collapsible: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <div data-open={open}>{children}</div>
    ),
    CollapsibleTrigger: ({
      children,
      asChild,
      onClick,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
      onClick?: (e: React.MouseEvent) => void;
    }) =>
      asChild ? (
        <span onClick={onClick}>{children}</span>
      ) : (
        <button onClick={onClick}>{children}</button>
      ),
    CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

import { ConnectionTracePanel } from './ConnectionTracePanel';

type TracePayload = NonNullable<ConnectionsTraceResponses[200]>;

function mockTraceSuccess(tree: TraceNode): void {
  connectionsTraceMock.mockImplementation(async () => ({
    data: { data: tree } satisfies TracePayload,
    error: undefined,
  }));
}

function mockTraceError(message: string, status: number): void {
  connectionsTraceMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
    response: { status },
  }));
}

function mockTraceNeverResolves(): void {
  connectionsTraceMock.mockImplementation(
    () => new Promise(() => undefined) as Promise<{ data: TracePayload; error: undefined }>
  );
}

function renderPanel(itemId = 'item-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConnectionTracePanel itemId={itemId} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionsTraceMock.mockReset();
});

describe('ConnectionTracePanel — loading', () => {
  it('renders skeleton rows while loading', () => {
    mockTraceNeverResolves();
    renderPanel();
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('ConnectionTracePanel — error', () => {
  it('renders error message on query failure', async () => {
    mockTraceError('Network error', 400);
    renderPanel();
    expect(await screen.findByText('Failed to load connection trace.')).toBeInTheDocument();
  });

  it('renders unavailable message when the pillar is unreachable', async () => {
    mockTraceError('Service unavailable', 500);
    renderPanel();
    expect(await screen.findByText('Connection chain unavailable.')).toBeInTheDocument();
  });
});

describe('ConnectionTracePanel — empty', () => {
  it('renders empty message when root has no children', async () => {
    mockTraceSuccess({
      id: 'item-1',
      itemName: 'Router',
      assetId: null,
      type: null,
      children: [],
    });
    renderPanel('item-1');
    expect(await screen.findByText('No connection chain found.')).toBeInTheDocument();
  });
});

describe('ConnectionTracePanel — chain rendering', () => {
  const tree: TraceNode = {
    id: 'item-1',
    itemName: 'Power Board',
    assetId: 'PWR01',
    type: 'Electronics',
    children: [
      {
        id: 'item-2',
        itemName: 'Monitor',
        assetId: 'MON02',
        type: 'Electronics',
        children: [
          {
            id: 'item-3',
            itemName: 'HDMI Cable',
            assetId: null,
            type: 'Cable',
            children: [],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    mockTraceSuccess(tree);
  });

  it('renders root item (current item) with (current) label', async () => {
    renderPanel('item-1');
    expect(await screen.findByText(/Power Board/)).toBeInTheDocument();
    expect(screen.getByText('(current)')).toBeInTheDocument();
  });

  it('renders child items', async () => {
    renderPanel('item-1');
    expect(await screen.findByText('Monitor')).toBeInTheDocument();
  });

  it('renders deeply nested items', async () => {
    renderPanel('item-1');
    expect(await screen.findByText('HDMI Cable')).toBeInTheDocument();
  });

  it('renders AssetIdBadge for items with asset IDs', async () => {
    renderPanel('item-1');
    await screen.findByText(/Power Board/);
    const badges = screen.getAllByTestId('asset-id-badge');
    expect(badges.some((b) => b.textContent === 'PWR01')).toBe(true);
    expect(badges.some((b) => b.textContent === 'MON02')).toBe(true);
  });

  it('omits AssetIdBadge for items without asset IDs', async () => {
    renderPanel('item-1');
    await screen.findByText(/Power Board/);
    const badges = screen.getAllByTestId('asset-id-badge');
    expect(badges.every((b) => b.textContent !== '')).toBe(true);
  });

  it('renders TypeBadge for items with type', async () => {
    renderPanel('item-1');
    await screen.findByText(/Power Board/);
    const typeBadges = screen.getAllByTestId('type-badge');
    expect(typeBadges.length).toBeGreaterThan(0);
  });

  it('shows connected items count in chain summary', async () => {
    renderPanel('item-1');
    // Tree has 3 nodes; 2 non-root
    expect(await screen.findByText(/2 connected items in chain/)).toBeInTheDocument();
  });

  it('navigates to child item on click (non-current item)', async () => {
    renderPanel('item-1');
    const monitorRow = (await screen.findByText('Monitor')).closest('[role="treeitem"]');
    expect(monitorRow).toBeTruthy();
    fireEvent.click(monitorRow!);
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/items/item-2');
  });

  it('does not navigate when clicking the current item', async () => {
    renderPanel('item-1');
    const currentRow = (await screen.findByText('(current)')).closest('[role="treeitem"]');
    expect(currentRow).toBeTruthy();
    fireEvent.click(currentRow!);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders with role="tree" on container', async () => {
    renderPanel('item-1');
    expect(await screen.findByRole('tree')).toBeInTheDocument();
  });

  it('renders treeitem roles for each node', async () => {
    renderPanel('item-1');
    await screen.findByText(/Power Board/);
    const items = screen.getAllByRole('treeitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ConnectionTracePanel — singular count', () => {
  it('shows singular "item" when exactly one connected item', async () => {
    mockTraceSuccess({
      id: 'item-1',
      itemName: 'Router',
      assetId: null,
      type: null,
      children: [{ id: 'item-2', itemName: 'Switch', assetId: null, type: null, children: [] }],
    });
    renderPanel('item-1');
    expect(await screen.findByText('1 connected item in chain')).toBeInTheDocument();
  });
});
