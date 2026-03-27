import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

/* ------------------------------------------------------------------ */
/*  Mock setup                                                        */
/* ------------------------------------------------------------------ */
const mockTreeQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("../lib/trpc", () => ({
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@pops/ui", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
  Button: ({ children, onClick, variant, disabled }: { children: React.ReactNode; onClick?: () => void; variant?: string; disabled?: boolean }) => (
    <button onClick={onClick} data-variant={variant} disabled={disabled}>{children}</button>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div className={`animate-pulse ${className ?? ""}`} />
  ),
  Collapsible: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (v: boolean) => void }) => (
    <div data-open={open} data-testid="collapsible">{children}</div>
  ),
  CollapsibleTrigger: ({ children, asChild, onClick }: { children: React.ReactNode; asChild?: boolean; onClick?: (e: React.MouseEvent) => void }) => (
    <div onClick={onClick}>{children}</div>
  ),
  CollapsibleContent: ({ children, forceMount }: { children: React.ReactNode; forceMount?: boolean }) => (
    <div>{children}</div>
  ),
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean; onOpenChange?: (v: boolean) => void }) => (
    open ? <div data-testid="dialog">{children}</div> : null
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/LocationContentsPanel", () => ({
  LocationContentsPanel: ({ locationId, locationName }: { locationId: string; locationName: string }) => (
    <div data-testid="contents-panel">{locationName}</div>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Mock @dnd-kit to test drag-and-drop logic                        */
/* ------------------------------------------------------------------ */
let capturedDragHandlers: {
  onDragStart?: (event: { active: { id: string } }) => void;
  onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
} = {};

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragStart, onDragEnd }: {
    children: React.ReactNode;
    sensors?: unknown;
    collisionDetection?: unknown;
    onDragStart?: (event: { active: { id: string } }) => void;
    onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void;
  }) => {
    capturedDragHandlers = { onDragStart, onDragEnd };
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

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode; items: string[]; strategy?: unknown }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  useSortable: ({ id }: { id: string }) => ({
    attributes: { "data-sortable-id": id },
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

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

import { LocationTreePage } from "./LocationTreePage";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */
const treeData = [
  {
    id: "home",
    name: "Home",
    parentId: null,
    sortOrder: 0,
    children: [
      {
        id: "bedroom",
        name: "Bedroom",
        parentId: "home",
        sortOrder: 0,
        children: [],
      },
      {
        id: "kitchen",
        name: "Kitchen",
        parentId: "home",
        sortOrder: 1,
        children: [],
      },
    ],
  },
  {
    id: "office",
    name: "Office",
    parentId: null,
    sortOrder: 1,
    children: [
      {
        id: "desk",
        name: "Desk",
        parentId: "office",
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
describe("LocationTreePage", () => {
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

  it("renders location tree with all nodes", () => {
    renderPage();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Office")).toBeInTheDocument();
  });

  it("renders loading skeleton", () => {
    mockTreeQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state", () => {
    mockTreeQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error("fail") });
    renderPage();
    expect(screen.getByText("Failed to load locations.")).toBeInTheDocument();
  });

  it("renders empty state when no locations", () => {
    mockTreeQuery.mockReturnValue({ data: { data: [] }, isLoading: false, error: null });
    renderPage();
    expect(screen.getByText(/No locations yet/)).toBeInTheDocument();
  });

  /* --- Drag-and-drop infrastructure --- */

  it("wraps tree in DndContext", () => {
    renderPage();
    expect(screen.getByTestId("dnd-context")).toBeInTheDocument();
  });

  it("wraps tree in SortableContext", () => {
    renderPage();
    const contexts = screen.getAllByTestId("sortable-context");
    expect(contexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders drag handles with correct aria-labels", () => {
    renderPage();
    expect(screen.getByLabelText("Drag Home")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag Office")).toBeInTheDocument();
  });

  it("renders DragOverlay container", () => {
    renderPage();
    expect(screen.getByTestId("drag-overlay")).toBeInTheDocument();
  });

  /* --- Arrow buttons hidden on desktop --- */

  it("arrow buttons have md:hidden class", () => {
    renderPage();
    const moveUpButtons = screen.getAllByTitle("Move up");
    moveUpButtons.forEach((btn) => {
      expect(btn.className).toContain("md:hidden");
    });
    const moveDownButtons = screen.getAllByTitle("Move down");
    moveDownButtons.forEach((btn) => {
      expect(btn.className).toContain("md:hidden");
    });
  });

  /* --- Drag handle styling --- */

  it("drag handle has cursor-grab and touch-none classes", () => {
    renderPage();
    const handle = screen.getByLabelText("Drag Home");
    expect(handle.className).toContain("cursor-grab");
    expect(handle.className).toContain("touch-none");
  });

  it("drag handle is hidden on mobile (hidden md:flex)", () => {
    renderPage();
    const handle = screen.getByLabelText("Drag Home");
    expect(handle.className).toContain("hidden");
    expect(handle.className).toContain("md:flex");
  });

  /* --- Drag-and-drop: reorder within siblings --- */

  it("reorders siblings when dropped on same-parent node", () => {
    renderPage();
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Simulate dragging "Office" (sortOrder=1) onto "Home" (sortOrder=0)
    // Both are root-level (parentId=null), so this is a reorder
    capturedDragHandlers.onDragEnd!({
      active: { id: "office" },
      over: { id: "home" },
    });

    // Should call updateMutation to reassign sort orders
    // arrayMove([home, office], 1, 0) → [office, home]
    // office: sortOrder was 1, now should be 0 → mutate
    // home: sortOrder was 0, now should be 1 → mutate
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "office", data: { sortOrder: 0 } })
    );
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "home", data: { sortOrder: 1 } })
    );
  });

  /* --- Drag-and-drop: reparent --- */

  it("reparents when dropped on node with different parent", () => {
    renderPage();
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Simulate dragging "desk" (parentId=office) onto "home" (parentId=null)
    // Different parents → reparent: make desk a child of home
    capturedDragHandlers.onDragEnd!({
      active: { id: "desk" },
      over: { id: "home" },
    });

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "desk", data: { parentId: "home" } })
    );
  });

  /* --- Drag-and-drop: prevent descendant drop --- */

  it("prevents dropping on own descendant", () => {
    renderPage();
    expect(capturedDragHandlers.onDragEnd).toBeDefined();

    // Simulate dragging "home" onto "bedroom" (bedroom is a child of home)
    capturedDragHandlers.onDragEnd!({
      active: { id: "home" },
      over: { id: "bedroom" },
    });

    // Should NOT call updateMutation
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  /* --- Drag-and-drop: no-op cases --- */

  it("does nothing when dropped on self", () => {
    renderPage();
    capturedDragHandlers.onDragEnd!({
      active: { id: "home" },
      over: { id: "home" },
    });
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it("does nothing when dropped on null (cancelled)", () => {
    renderPage();
    capturedDragHandlers.onDragEnd!({
      active: { id: "home" },
      over: null,
    });
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  /* --- Selection --- */

  it("selects a location on click", () => {
    renderPage();
    fireEvent.click(screen.getByText("Home"));
    expect(screen.getByTestId("contents-panel")).toHaveTextContent("Home");
  });

  it("deselects on second click", () => {
    renderPage();
    const treeItems = screen.getAllByRole("treeitem");
    const homeItem = treeItems.find((el) => el.textContent?.includes("Home"))!;
    fireEvent.click(homeItem);
    expect(screen.getByTestId("contents-panel")).toBeInTheDocument();
    fireEvent.click(homeItem);
    expect(screen.queryByTestId("contents-panel")).not.toBeInTheDocument();
  });
});
