import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTraceQuery = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      connections: {
        trace: { useQuery: (...args: unknown[]) => mockTraceQuery(...args) },
      },
    },
  },
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

function renderPanel(itemId = 'item-1') {
  return render(
    <MemoryRouter>
      <ConnectionTracePanel itemId={itemId} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTraceQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

describe('ConnectionTracePanel — loading', () => {
  it('renders skeleton rows while loading', () => {
    mockTraceQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPanel();
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('ConnectionTracePanel — error', () => {
  it('renders error message on query failure', () => {
    mockTraceQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    });
    renderPanel();
    expect(screen.getByText('Failed to load connection trace.')).toBeInTheDocument();
  });
});

describe('ConnectionTracePanel — empty', () => {
  it('renders empty message when root has no children', () => {
    mockTraceQuery.mockReturnValue({
      data: { data: { id: 'item-1', itemName: 'Router', assetId: null, type: null, children: [] } },
      isLoading: false,
      error: null,
    });
    renderPanel('item-1');
    expect(screen.getByText('No connection chain found.')).toBeInTheDocument();
  });
});

describe('ConnectionTracePanel — chain rendering', () => {
  const tree = {
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
    mockTraceQuery.mockReturnValue({
      data: { data: tree },
      isLoading: false,
      error: null,
    });
  });

  it('renders root item (current item) with (current) label', () => {
    renderPanel('item-1');
    expect(screen.getByText(/Power Board/)).toBeInTheDocument();
    expect(screen.getByText('(current)')).toBeInTheDocument();
  });

  it('renders child items', () => {
    renderPanel('item-1');
    expect(screen.getByText('Monitor')).toBeInTheDocument();
  });

  it('renders deeply nested items', () => {
    renderPanel('item-1');
    expect(screen.getByText('HDMI Cable')).toBeInTheDocument();
  });

  it('renders AssetIdBadge for items with asset IDs', () => {
    renderPanel('item-1');
    const badges = screen.getAllByTestId('asset-id-badge');
    expect(badges.some((b) => b.textContent === 'PWR01')).toBe(true);
    expect(badges.some((b) => b.textContent === 'MON02')).toBe(true);
  });

  it('omits AssetIdBadge for items without asset IDs', () => {
    renderPanel('item-1');
    const badges = screen.getAllByTestId('asset-id-badge');
    expect(badges.every((b) => b.textContent !== '')).toBe(true);
  });

  it('renders TypeBadge for items with type', () => {
    renderPanel('item-1');
    const typeBadges = screen.getAllByTestId('type-badge');
    expect(typeBadges.length).toBeGreaterThan(0);
  });

  it('shows connected items count in chain summary', () => {
    renderPanel('item-1');
    // Tree has 3 nodes; 2 non-root
    expect(screen.getByText(/2 connected items in chain/)).toBeInTheDocument();
  });

  it('navigates to child item on click (non-current item)', () => {
    renderPanel('item-1');
    const monitorRow = screen.getByText('Monitor').closest('[role="treeitem"]');
    expect(monitorRow).toBeTruthy();
    fireEvent.click(monitorRow!);
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/items/item-2');
  });

  it('does not navigate when clicking the current item', () => {
    renderPanel('item-1');
    const currentRow = screen.getByText('(current)').closest('[role="treeitem"]');
    expect(currentRow).toBeTruthy();
    fireEvent.click(currentRow!);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders with role="tree" on container', () => {
    renderPanel('item-1');
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('renders treeitem roles for each node', () => {
    renderPanel('item-1');
    const items = screen.getAllByRole('treeitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ConnectionTracePanel — singular count', () => {
  it('shows singular "item" when exactly one connected item', () => {
    mockTraceQuery.mockReturnValue({
      data: {
        data: {
          id: 'item-1',
          itemName: 'Router',
          assetId: null,
          type: null,
          children: [{ id: 'item-2', itemName: 'Switch', assetId: null, type: null, children: [] }],
        },
      },
      isLoading: false,
      error: null,
    });
    renderPanel('item-1');
    expect(screen.getByText('1 connected item in chain')).toBeInTheDocument();
  });
});
