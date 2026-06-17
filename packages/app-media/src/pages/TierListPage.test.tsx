import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Capture DndContext handlers so drag tests can simulate drag-end events
const dndHandlers = vi.hoisted(() => ({
  onDragEnd: undefined as
    | ((e: { active: { id: string }; over: { id: string } | null }) => void)
    | undefined,
}));

vi.mock('@dnd-kit/core', async () => {
  const { createElement: ce, Fragment } = await import('react');
  return {
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode;
      onDragEnd?: (e: unknown) => void;
    }) => {
      dndHandlers.onDragEnd = onDragEnd as typeof dndHandlers.onDragEnd;
      return ce(Fragment, null, children);
    },
    DragOverlay: () => null,
    closestCenter: 'closestCenter',
    pointerWithin: 'pointerWithin',
    PointerSensor: class PointerSensor {},
    useSensor: (sensor: unknown) => sensor,
    useSensors: (...sensors: unknown[]) => sensors,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const { createElement: ce, Fragment } = await import('react');
  return {
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    SortableContext: ({ children }: { children: ReactNode }) => ce(Fragment, null, children),
    horizontalListSortingStrategy: 'horizontal',
  };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

const mockListDimensions = vi.fn();
const mockGetTierListMovies = vi.fn();
const mockCreateDimension = vi.fn();
const mockSubmitTierList = vi.fn();
const mockMarkStale = vi.fn();
const mockExcludeFromDimension = vi.fn();
const mockBlacklistMovie = vi.fn();

vi.mock('../media-api/index.js', () => ({
  comparisonsListDimensions: () => mockListDimensions(),
  comparisonsGetTierListMovies: (opts: unknown) => mockGetTierListMovies(opts),
  comparisonsCreateDimension: (opts: unknown) => mockCreateDimension(opts),
  comparisonsSubmitTierList: (opts: unknown) => mockSubmitTierList(opts),
  comparisonsMarkStale: (opts: unknown) => mockMarkStale(opts),
  comparisonsExcludeFromDimension: (opts: unknown) => mockExcludeFromDimension(opts),
  comparisonsBlacklistMovie: (opts: unknown) => mockBlacklistMovie(opts),
}));

import { TierListPage } from './TierListPage';

const dim1 = { id: 1, name: 'Cinematography', active: true, description: null, sortOrder: 0 };
const dim2 = { id: 2, name: 'Entertainment', active: true, description: null, sortOrder: 1 };

const movies = [
  {
    id: 10,
    title: 'The Matrix',
    posterUrl: null,
    score: 1500,
    comparisonCount: 5,
    tierOverride: null,
  },
  {
    id: 20,
    title: 'Inception',
    posterUrl: null,
    score: 1480,
    comparisonCount: 3,
    tierOverride: null,
  },
  {
    id: 30,
    title: 'Interstellar',
    posterUrl: null,
    score: 1520,
    comparisonCount: 8,
    tierOverride: null,
  },
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, children));
  return render(<TierListPage />, { wrapper });
}

function setupPage(dimensions = [dim1, dim2], tierMovies = movies) {
  mockListDimensions.mockResolvedValue({ data: { data: dimensions } });
  mockGetTierListMovies.mockResolvedValue({ data: { data: tierMovies } });
}

describe('TierListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDimension.mockResolvedValue({ data: { data: { id: 99 }, message: 'ok' } });
    mockSubmitTierList.mockResolvedValue({
      data: { data: { comparisonsRecorded: 1, scoreChanges: [] } },
    });
    mockMarkStale.mockResolvedValue({ data: { data: { staleness: 0.5 } } });
    mockExcludeFromDimension.mockResolvedValue({ data: { comparisonsDeleted: 0 } });
    mockBlacklistMovie.mockResolvedValue({
      data: {
        data: { blacklistedCount: 1, comparisonsDeleted: 0, dimensionsRecalculated: 0 },
        message: 'ok',
      },
    });
  });

  it('renders dimension chips with first auto-selected', async () => {
    setupPage();
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(2));
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
  });

  it('renders movie cards in unranked pool', async () => {
    setupPage();
    renderPage();

    expect(await screen.findByText('The Matrix')).toBeTruthy();
    expect(screen.getByText('Inception')).toBeTruthy();
    expect(screen.getByText('Interstellar')).toBeTruthy();
  });

  it('displays unranked count', async () => {
    setupPage();
    renderPage();

    expect(await screen.findByText('Unranked (3)')).toBeTruthy();
  });

  it('switching dimension changes selected chip', async () => {
    setupPage();
    renderPage();

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(2));
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]!);

    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
  });

  it('switching dimension reloads movies with new dimensionId', async () => {
    setupPage();
    renderPage();

    await waitFor(() =>
      expect(mockGetTierListMovies).toHaveBeenCalledWith({ path: { dimensionId: 1 } })
    );

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]!);

    await waitFor(() =>
      expect(mockGetTierListMovies).toHaveBeenCalledWith({ path: { dimensionId: 2 } })
    );
  });

  it('refresh button calls refetch', async () => {
    setupPage();
    renderPage();

    await screen.findByText('The Matrix');
    mockGetTierListMovies.mockClear();

    fireEvent.click(screen.getByLabelText('Refresh movie pool'));

    await waitFor(() => expect(mockGetTierListMovies).toHaveBeenCalled());
  });

  it('shows empty state when no movies available', async () => {
    setupPage([dim1], []);
    renderPage();

    expect(await screen.findByText(/No eligible movies/)).toBeTruthy();
  });

  it('shows loading skeletons when data is loading', () => {
    // Never-resolving promises keep the queries in their loading state.
    mockListDimensions.mockReturnValue(new Promise(() => {}));
    mockGetTierListMovies.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.queryByText('The Matrix')).toBeNull();
    expect(screen.queryByText('Tier List')).toBeTruthy();
  });

  it('submit button is disabled when fewer than 2 movies placed', async () => {
    setupPage();
    renderPage();

    const submitBtn = await screen.findByRole('button', { name: /Submit Tier List/i });
    expect(submitBtn).toBeDisabled();
  });

  it('drag-drop: movie moves from pool to tier row', async () => {
    setupPage();
    renderPage();

    await screen.findByText('The Matrix');

    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '10' }, over: { id: 'S' } });
    });

    expect(screen.getByText('Unranked (2)')).toBeTruthy();
  });

  it('drag-drop: movie moves between tiers (reposition)', async () => {
    setupPage();
    renderPage();

    await screen.findByText('The Matrix');

    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '10' }, over: { id: 'S' } });
    });
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '10' }, over: { id: 'A' } });
    });

    expect(screen.getByText('Unranked (2)')).toBeTruthy();
  });

  it('drag-drop: movie removed from tier back to unranked pool', async () => {
    setupPage();
    renderPage();

    await screen.findByText('The Matrix');

    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '10' }, over: { id: 'S' } });
    });
    expect(screen.getByText('Unranked (2)')).toBeTruthy();

    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '10' }, over: { id: 'unranked' } });
    });
    expect(screen.getByText('Unranked (3)')).toBeTruthy();
  });

  it('submit button enables when 2+ movies placed and calls mutate', async () => {
    setupPage();
    renderPage();

    await screen.findByText('The Matrix');

    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '10' }, over: { id: 'S' } });
    });
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '20' }, over: { id: 'A' } });
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Tier List/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() =>
      expect(mockSubmitTierList).toHaveBeenCalledWith({
        body: {
          dimensionId: 1,
          placements: expect.arrayContaining([
            { movieId: 10, tier: 'S' },
            { movieId: 20, tier: 'A' },
          ]),
        },
      })
    );
  });

  it('empty-state CTA opens the create dimension dialog', async () => {
    setupPage([], []);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Create dimension/i }));

    // DialogTitle becomes visible — Radix renders into a portal under document.body.
    expect(screen.getByRole('heading', { name: 'New dimension' })).toBeTruthy();
  });

  it('header "+ New" button is visible when dimensions exist', async () => {
    setupPage();
    renderPage();

    // Distinct from the empty-state "Create dimension" button — header CTA is
    // a small "New" button with the same plus icon.
    expect(await screen.findByRole('button', { name: /^\s*New\s*$/i })).toBeTruthy();
  });

  it('submitting the create dimension form fires the createDimension mutation', async () => {
    setupPage([], []);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Create dimension/i }));

    const nameInput = screen.getByPlaceholderText(/e\.g\. Cinematography/i);
    fireEvent.change(nameInput, { target: { value: ' Soundtrack ' } });

    const descriptionInput = screen.getByPlaceholderText(/Optional/i);
    fireEvent.change(descriptionInput, { target: { value: 'How the music holds up' } });

    // Footer submit — the "Create dimension" button inside the dialog footer.
    const submitButtons = screen.getAllByRole('button', { name: /Create dimension/i });
    // After opening the dialog there are two — the empty-state CTA and the
    // dialog footer submit. Click the last one (the dialog's).
    fireEvent.click(submitButtons[submitButtons.length - 1]!);

    await waitFor(() =>
      expect(mockCreateDimension).toHaveBeenCalledWith({
        body: {
          name: 'Soundtrack',
          description: 'How the music holds up',
          active: true,
          sortOrder: 0,
          weight: 1.0,
        },
      })
    );
  });
});
