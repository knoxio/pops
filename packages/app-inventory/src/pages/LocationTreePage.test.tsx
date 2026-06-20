import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  LocationsCreateResponses,
  LocationsDeleteResponses,
  LocationsTreeResponses,
  LocationsUpdateResponses,
} from '../inventory-api/types.gen';
import type { LocationTreeNode } from './location-tree-page/utils';

const { mockLocationsTree, mockLocationsCreate, mockLocationsUpdate, mockLocationsDelete } =
  vi.hoisted(() => ({
    mockLocationsTree: vi.fn(),
    mockLocationsCreate: vi.fn(),
    mockLocationsUpdate: vi.fn(),
    mockLocationsDelete: vi.fn(),
  }));

vi.mock('../inventory-api/index.js', () => ({
  locationsTree: (...args: unknown[]) => mockLocationsTree(...args),
  locationsCreate: (...args: unknown[]) => mockLocationsCreate(...args),
  locationsUpdate: (...args: unknown[]) => mockLocationsUpdate(...args),
  locationsDelete: (...args: unknown[]) => mockLocationsDelete(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/LocationContentsPanel', () => ({
  LocationContentsPanel: ({ locationName }: { locationName: string }) => (
    <div data-testid="contents-panel">{locationName}</div>
  ),
}));

let capturedDragHandlers: {
  onDragStart?: (event: { active: { id: string } }) => void;
  onDragOver?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
} = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragOver,
    onDragEnd,
  }: {
    children: React.ReactNode;
    sensors?: unknown;
    collisionDetection?: unknown;
    onDragStart?: (event: { active: { id: string } }) => void;
    onDragOver?: (event: { active: { id: string }; over: { id: string } | null }) => void;
    onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  }) => {
    capturedDragHandlers = { onDragStart, onDragOver, onDragEnd };
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({
    children,
  }: {
    children: React.ReactNode;
    items: string[];
    strategy?: unknown;
  }) => <div data-testid="sortable-context">{children}</div>,
  useSortable: ({ id }: { id: string }) => ({
    attributes: { 'data-sortable-id': id },
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
    isOver: false,
  }),
  verticalListSortingStrategy: vi.fn(),
  arrayMove: <T,>(arr: T[], from: number, to: number): T[] => {
    const result = [...arr];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item!);
    return result;
  },
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => {} } },
}));

import { LocationTreePage } from './LocationTreePage';

const treeData: LocationTreeNode[] = [
  {
    id: 'home',
    name: 'Home',
    parentId: null,
    sortOrder: 0,
    children: [
      { id: 'bedroom', name: 'Bedroom', parentId: 'home', sortOrder: 0, children: [] },
      { id: 'kitchen', name: 'Kitchen', parentId: 'home', sortOrder: 1, children: [] },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    parentId: null,
    sortOrder: 1,
    children: [{ id: 'desk', name: 'Desk', parentId: 'office', sortOrder: 0, children: [] }],
  },
];

type TreePayload = NonNullable<LocationsTreeResponses[200]>;
type CreatePayload = NonNullable<LocationsCreateResponses[201]>;
type UpdatePayload = NonNullable<LocationsUpdateResponses[200]>;
type DeletePayload = NonNullable<LocationsDeleteResponses[200]>;

function mockTreeSuccess(nodes: LocationTreeNode[]): void {
  mockLocationsTree.mockImplementation(async () => ({
    data: { data: nodes } satisfies TreePayload,
    error: undefined,
  }));
}

function mockTreeUnavailable(message: string): void {
  mockLocationsTree.mockImplementation(async () => ({
    data: undefined,
    error: { message },
    response: { status: 500 },
  }));
}

function mockTreeNeverResolves(): void {
  mockLocationsTree.mockImplementation(() => new Promise(() => undefined));
}

function mockUpdateSuccess(): void {
  mockLocationsUpdate.mockImplementation(async () => ({
    data: {
      data: { id: 'home', name: 'Home', parentId: null, sortOrder: 0 },
      message: 'updated',
    } satisfies UpdatePayload,
    error: undefined,
  }));
}

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LocationTreePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedDragHandlers = {};
  mockTreeSuccess(treeData);
  mockUpdateSuccess();
  mockLocationsCreate.mockImplementation(async () => ({
    data: {
      data: { id: 'new', name: 'New', parentId: null, sortOrder: 0 },
      message: 'created',
    } satisfies CreatePayload,
    error: undefined,
  }));
  mockLocationsDelete.mockImplementation(async () => ({
    data: { message: 'deleted' } satisfies DeletePayload,
    error: undefined,
  }));
});

describe('LocationTreePage', () => {
  /* --- Basic rendering --- */

  it('renders location tree with all nodes', async () => {
    renderPage();
    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    mockTreeNeverResolves();
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    mockTreeUnavailable('fail');
    renderPage();
    expect(await screen.findByText('Failed to load locations.')).toBeInTheDocument();
  });

  it('renders empty state when no locations', async () => {
    mockTreeSuccess([]);
    renderPage();
    expect(await screen.findByText(/No locations yet/)).toBeInTheDocument();
  });

  /* --- Drag-and-drop infrastructure --- */

  it('wraps tree in DndContext', async () => {
    renderPage();
    expect(await screen.findByTestId('dnd-context')).toBeInTheDocument();
  });

  it('wraps tree in SortableContext', async () => {
    renderPage();
    await screen.findByTestId('dnd-context');
    const contexts = screen.getAllByTestId('sortable-context');
    expect(contexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders drag handles with correct aria-labels', async () => {
    renderPage();
    expect(await screen.findByLabelText('Drag Home')).toBeInTheDocument();
    expect(screen.getByLabelText('Drag Office')).toBeInTheDocument();
  });

  it('renders DragOverlay container', async () => {
    renderPage();
    expect(await screen.findByTestId('drag-overlay')).toBeInTheDocument();
  });

  /* --- Arrow buttons for coarse pointers (touch devices) --- */

  it('arrow buttons use pointer:coarse media query', async () => {
    renderPage();
    await screen.findByText('Home');
    const moveUpButtons = screen.getAllByTitle('Move up');
    moveUpButtons.forEach((btn) => {
      expect(btn.className).toContain('[@media(pointer:coarse)]:inline-flex');
    });
    const moveDownButtons = screen.getAllByTitle('Move down');
    moveDownButtons.forEach((btn) => {
      expect(btn.className).toContain('[@media(pointer:coarse)]:inline-flex');
    });
  });

  /* --- Drag handle styling --- */

  it('drag handle has cursor-grab and touch-none classes', async () => {
    renderPage();
    const handle = await screen.findByLabelText('Drag Home');
    expect(handle.className).toContain('cursor-grab');
    expect(handle.className).toContain('touch-none');
  });

  it('drag handle uses pointer:fine media query', async () => {
    renderPage();
    const handle = await screen.findByLabelText('Drag Home');
    expect(handle.className).toContain('hidden');
    expect(handle.className).toContain('[@media(pointer:fine)]:flex');
  });

  /* --- Drag-and-drop: reorder within siblings --- */

  it('reorders siblings when dropped on same-parent node', async () => {
    renderPage();
    await screen.findByText('Home');
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Dragging "Office" (sortOrder=1) onto "Home" (sortOrder=0). Both root-level
    // (parentId=null) → reorder. arrayMove([home, office], 1, 0) → [office, home]:
    // office sortOrder 1→0 and home sortOrder 0→1 both mutate.
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });

    await waitFor(() =>
      expect(mockLocationsUpdate).toHaveBeenCalledWith({
        path: { id: 'office' },
        body: { sortOrder: 0 },
      })
    );
    await waitFor(() =>
      expect(mockLocationsUpdate).toHaveBeenCalledWith({
        path: { id: 'home' },
        body: { sortOrder: 1 },
      })
    );
  });

  /* --- Drag-and-drop: reparent --- */

  it('reparents when dropped on node with different parent', async () => {
    renderPage();
    await screen.findByText('Home');
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Dragging "desk" (parentId=office) onto "home" (parentId=null): different
    // parents → reparent desk under home.
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'desk' },
        over: { id: 'home' },
      });
    });

    await waitFor(() =>
      expect(mockLocationsUpdate).toHaveBeenCalledWith({
        path: { id: 'desk' },
        body: { parentId: 'home' },
      })
    );
  });

  /* --- Drag-and-drop: prevent descendant drop --- */

  it('prevents dropping on own descendant', async () => {
    renderPage();
    await screen.findByText('Home');
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Dragging "home" onto "bedroom" (a child of home): guard returns synchronously.
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'home' },
        over: { id: 'bedroom' },
      });
    });

    expect(mockLocationsUpdate).not.toHaveBeenCalled();
  });

  /* --- Drag-and-drop: no-op cases --- */

  it('does nothing when dropped on self', async () => {
    renderPage();
    await screen.findByText('Home');
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'home' },
        over: { id: 'home' },
      });
    });
    expect(mockLocationsUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when dropped on null (cancelled)', async () => {
    renderPage();
    await screen.findByText('Home');
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'home' },
        over: null,
      });
    });
    expect(mockLocationsUpdate).not.toHaveBeenCalled();
  });

  /* --- Drop indicator line --- */

  it('shows drop indicator when dragging over a sibling', async () => {
    renderPage();
    await screen.findByText('Home');
    act(() => {
      capturedDragHandlers.onDragStart!({ active: { id: 'office' } });
    });
    act(() => {
      capturedDragHandlers.onDragOver!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });
    expect(await screen.findByTestId('drop-indicator')).toBeInTheDocument();
  });

  it('removes drop indicator on drag end', async () => {
    renderPage();
    await screen.findByText('Home');
    act(() => {
      capturedDragHandlers.onDragStart!({ active: { id: 'office' } });
    });
    act(() => {
      capturedDragHandlers.onDragOver!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });
    expect(await screen.findByTestId('drop-indicator')).toBeInTheDocument();
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument();
  });

  /* --- Selection --- */

  it('selects a location on click', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Home'));
    expect(screen.getByTestId('contents-panel')).toHaveTextContent('Home');
  });

  it('deselects on second click', async () => {
    renderPage();
    await screen.findByText('Home');
    const treeItems = screen.getAllByRole('treeitem');
    const homeItem = treeItems.find((el) => el.textContent?.includes('Home'))!;
    fireEvent.click(homeItem);
    expect(screen.getByTestId('contents-panel')).toBeInTheDocument();
    fireEvent.click(homeItem);
    expect(screen.queryByTestId('contents-panel')).not.toBeInTheDocument();
  });
});
