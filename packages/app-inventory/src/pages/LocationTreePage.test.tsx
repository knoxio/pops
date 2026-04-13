import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock setup                                                        */
/* ------------------------------------------------------------------ */
const mockTreeQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    inventory: {
      locations: {
        tree: {
          useQuery: (...args: unknown[]) => mockTreeQuery(...args),
        },
        create: {
          useMutation: (opts: Record<string, unknown>) => {
            (mockCreateMutate as unknown as Record<string, unknown>).__opts = opts;
            return { mutate: mockCreateMutate, isPending: false };
          },
        },
        update: {
          useMutation: (opts: Record<string, unknown>) => {
            (mockUpdateMutate as unknown as Record<string, unknown>).__opts = opts;
            return { mutate: mockUpdateMutate, isPending: false };
          },
        },
        delete: {
          useMutation: (opts: Record<string, unknown>) => {
            (mockDeleteMutate as unknown as Record<string, unknown>).__opts = opts;
            return { mutate: mockDeleteMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      inventory: {
        locations: {
          tree: { invalidate: mockInvalidate },
        },
      },
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/LocationContentsPanel', () => ({
  LocationContentsPanel: ({ locationName }: { locationName: string }) => (
    <div data-testid="contents-panel">{locationName}</div>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Mock @dnd-kit to test drag-and-drop logic                        */
/* ------------------------------------------------------------------ */
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
  CSS: { Transform: { toString: () => undefined } },
}));

import { LocationTreePage } from './LocationTreePage';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */
const treeData = [
  {
    id: 'home',
    name: 'Home',
    parentId: null,
    sortOrder: 0,
    children: [
      {
        id: 'bedroom',
        name: 'Bedroom',
        parentId: 'home',
        sortOrder: 0,
        children: [],
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        parentId: 'home',
        sortOrder: 1,
        children: [],
      },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    parentId: null,
    sortOrder: 1,
    children: [
      {
        id: 'desk',
        name: 'Desk',
        parentId: 'office',
        sortOrder: 0,
        children: [],
      },
    ],
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <LocationTreePage />
    </MemoryRouter>
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */
describe('LocationTreePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDragHandlers = {};
    mockTreeQuery.mockReturnValue({
      data: { data: treeData },
      isLoading: false,
      error: null,
    });
  });

  /* --- Basic rendering --- */

  it('renders location tree with all nodes', () => {
    renderPage();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    mockTreeQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockTreeQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') });
    renderPage();
    expect(screen.getByText('Failed to load locations.')).toBeInTheDocument();
  });

  it('renders empty state when no locations', () => {
    mockTreeQuery.mockReturnValue({ data: { data: [] }, isLoading: false, error: null });
    renderPage();
    expect(screen.getByText(/No locations yet/)).toBeInTheDocument();
  });

  /* --- Drag-and-drop infrastructure --- */

  it('wraps tree in DndContext', () => {
    renderPage();
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
  });

  it('wraps tree in SortableContext', () => {
    renderPage();
    const contexts = screen.getAllByTestId('sortable-context');
    expect(contexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders drag handles with correct aria-labels', () => {
    renderPage();
    expect(screen.getByLabelText('Drag Home')).toBeInTheDocument();
    expect(screen.getByLabelText('Drag Office')).toBeInTheDocument();
  });

  it('renders DragOverlay container', () => {
    renderPage();
    expect(screen.getByTestId('drag-overlay')).toBeInTheDocument();
  });

  /* --- Arrow buttons for coarse pointers (touch devices) --- */

  it('arrow buttons use pointer:coarse media query', () => {
    renderPage();
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

  it('drag handle has cursor-grab and touch-none classes', () => {
    renderPage();
    const handle = screen.getByLabelText('Drag Home');
    expect(handle.className).toContain('cursor-grab');
    expect(handle.className).toContain('touch-none');
  });

  it('drag handle uses pointer:fine media query', () => {
    renderPage();
    const handle = screen.getByLabelText('Drag Home');
    expect(handle.className).toContain('hidden');
    expect(handle.className).toContain('[@media(pointer:fine)]:flex');
  });

  /* --- Drag-and-drop: reorder within siblings --- */

  it('reorders siblings when dropped on same-parent node', () => {
    renderPage();
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Simulate dragging "Office" (sortOrder=1) onto "Home" (sortOrder=0)
    // Both are root-level (parentId=null), so this is a reorder
    capturedDragHandlers.onDragEnd!({
      active: { id: 'office' },
      over: { id: 'home' },
    });

    // Should call updateMutation to reassign sort orders
    // arrayMove([home, office], 1, 0) → [office, home]
    // office: sortOrder was 1, now should be 0 → mutate
    // home: sortOrder was 0, now should be 1 → mutate
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'office', data: { sortOrder: 0 } })
    );
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'home', data: { sortOrder: 1 } })
    );
  });

  /* --- Drag-and-drop: reparent --- */

  it('reparents when dropped on node with different parent', () => {
    renderPage();
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Simulate dragging "desk" (parentId=office) onto "home" (parentId=null)
    // Different parents → reparent: make desk a child of home
    capturedDragHandlers.onDragEnd!({
      active: { id: 'desk' },
      over: { id: 'home' },
    });

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'desk', data: { parentId: 'home' } })
    );
  });

  /* --- Drag-and-drop: prevent descendant drop --- */

  it('prevents dropping on own descendant', () => {
    renderPage();
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Simulate dragging "home" onto "bedroom" (bedroom is a child of home)
    capturedDragHandlers.onDragEnd!({
      active: { id: 'home' },
      over: { id: 'bedroom' },
    });

    // Should NOT call updateMutation
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  /* --- Drag-and-drop: no-op cases --- */

  it('does nothing when dropped on self', () => {
    renderPage();
    capturedDragHandlers.onDragEnd!({
      active: { id: 'home' },
      over: { id: 'home' },
    });
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('does nothing when dropped on null (cancelled)', () => {
    renderPage();
    capturedDragHandlers.onDragEnd!({
      active: { id: 'home' },
      over: null,
    });
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  /* --- Drop indicator line --- */

  it('shows drop indicator when dragging over a sibling', () => {
    renderPage();
    act(() => {
      capturedDragHandlers.onDragStart!({ active: { id: 'office' } });
    });
    act(() => {
      capturedDragHandlers.onDragOver!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument();
  });

  it('removes drop indicator on drag end', () => {
    renderPage();
    act(() => {
      capturedDragHandlers.onDragStart!({ active: { id: 'office' } });
    });
    act(() => {
      capturedDragHandlers.onDragOver!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument();
    act(() => {
      capturedDragHandlers.onDragEnd!({
        active: { id: 'office' },
        over: { id: 'home' },
      });
    });
    expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument();
  });

  /* --- Selection --- */

  it('selects a location on click', () => {
    renderPage();
    fireEvent.click(screen.getByText('Home'));
    expect(screen.getByTestId('contents-panel')).toHaveTextContent('Home');
  });

  it('deselects on second click', () => {
    renderPage();
    const treeItems = screen.getAllByRole('treeitem');
    const homeItem = treeItems.find((el) => el.textContent?.includes('Home'))!;
    fireEvent.click(homeItem);
    expect(screen.getByTestId('contents-panel')).toBeInTheDocument();
    fireEvent.click(homeItem);
    expect(screen.queryByTestId('contents-panel')).not.toBeInTheDocument();
  });
});
