import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TierListBoard, type TierMovie } from './TierListBoard';

// Capture DndContext handlers so tests can simulate drag-end events
const dndHandlers = vi.hoisted(() => ({
  onDragEnd: undefined as
    | ((e: { active: { id: string }; over: { id: string } | null }) => void)
    | undefined,
  onDragOver: undefined as ((e: unknown) => void) | undefined,
}));

vi.mock('@dnd-kit/core', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    DndContext: ({
      children,
      onDragEnd,
      onDragOver,
    }: {
      children: unknown;
      onDragEnd?: (e: unknown) => void;
      onDragOver?: (e: unknown) => void;
    }) => {
      dndHandlers.onDragEnd = onDragEnd as typeof dndHandlers.onDragEnd;
      dndHandlers.onDragOver = onDragOver;
      return createElement(Fragment, null, children as any);
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
  const { createElement, Fragment } = await import('react');
  return {
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    SortableContext: ({ children }: { children: unknown }) =>
      createElement(Fragment, null, children as any),
    horizontalListSortingStrategy: 'horizontal',
  };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

const sampleMovies: TierMovie[] = [
  {
    mediaType: 'movie',
    mediaId: 1,
    title: 'The Matrix',
    posterUrl: null,
    score: 1600,
    comparisonCount: 5,
    tierOverride: null,
  },
  {
    mediaType: 'movie',
    mediaId: 2,
    title: 'Inception',
    posterUrl: null,
    score: 1500,
    comparisonCount: 3,
    tierOverride: null,
  },
  {
    mediaType: 'movie',
    mediaId: 3,
    title: 'Interstellar',
    posterUrl: null,
    score: 1400,
    comparisonCount: 8,
    tierOverride: null,
  },
  {
    mediaType: 'movie',
    mediaId: 4,
    title: 'The Prestige',
    posterUrl: null,
    score: 1300,
    comparisonCount: 2,
    tierOverride: null,
  },
];

describe('TierListBoard', () => {
  it('renders all 5 tier rows with labels', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    expect(screen.getByText('S')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('renders all movies in the unranked pool initially', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    expect(screen.getByText('The Matrix')).toBeTruthy();
    expect(screen.getByText('Inception')).toBeTruthy();
    expect(screen.getByText('Interstellar')).toBeTruthy();
    expect(screen.getByText('The Prestige')).toBeTruthy();
    expect(screen.getByText('Unranked (4)')).toBeTruthy();
  });

  it('renders submit button disabled when no movies are placed', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /submit tier list/i });
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });

  it("renders 'Drop movies here' placeholder in empty tier rows", () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    const placeholders = screen.getAllByText('Drop movies here');
    expect(placeholders.length).toBe(5); // One per tier row
  });

  it('renders movie cards with data-testid attributes', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('movie-card-1')).toBeTruthy();
    expect(screen.getByTestId('movie-card-2')).toBeTruthy();
    expect(screen.getByTestId('movie-card-3')).toBeTruthy();
    expect(screen.getByTestId('movie-card-4')).toBeTruthy();
  });

  it('shows submit pending state', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} submitPending />);

    expect(screen.getByText(/submitting/i)).toBeTruthy();
  });

  it('renders with empty movie list', () => {
    render(<TierListBoard movies={[]} onSubmit={vi.fn()} />);

    expect(screen.getByText('Unranked (0)')).toBeTruthy();
    expect(screen.getByText('All movies placed!')).toBeTruthy();
    const submitBtn = screen.getByRole('button', { name: /submit tier list/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });

  it('drag triggers correct tier update — movie moves from unranked to tier S', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    // Initially 4 unranked
    expect(screen.getByText('Unranked (4)')).toBeTruthy();

    // Simulate drag-end: movie 1 (The Matrix) dropped onto tier S
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '1' }, over: { id: 'S' } });
    });

    // The Matrix should now be placed — unranked drops to 3
    expect(screen.getByText('Unranked (3)')).toBeTruthy();
    // Submit button should now be enabled (1 placed — still disabled until 2)
    const submitBtn = screen.getByRole('button', { name: /submit tier list/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });

  it('drag triggers correct tier update — 2 placements enable submit', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '1' }, over: { id: 'S' } });
    });
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '2' }, over: { id: 'A' } });
    });

    expect(screen.getByText('Unranked (2)')).toBeTruthy();
    const submitBtn = screen.getByRole('button', { name: /submit tier list/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(false);
  });

  it('drag triggers correct tier update — movie returns to unranked when dropped on unranked zone', () => {
    render(<TierListBoard movies={sampleMovies} onSubmit={vi.fn()} />);

    // Place The Matrix in tier S
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '1' }, over: { id: 'S' } });
    });
    expect(screen.getByText('Unranked (3)')).toBeTruthy();

    // Return to unranked
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: '1' }, over: { id: 'unranked' } });
    });
    expect(screen.getByText('Unranked (4)')).toBeTruthy();
  });

  it('hydrates placements from tier overrides on mount', () => {
    const moviesWithOverrides: TierMovie[] = [
      {
        mediaType: 'movie',
        mediaId: 1,
        title: 'The Matrix',
        posterUrl: null,
        score: 1600,
        comparisonCount: 5,
        tierOverride: 'S',
      },
      {
        mediaType: 'movie',
        mediaId: 2,
        title: 'Inception',
        posterUrl: null,
        score: 1500,
        comparisonCount: 3,
        tierOverride: 'B',
      },
      {
        mediaType: 'movie',
        mediaId: 3,
        title: 'Interstellar',
        posterUrl: null,
        score: 1400,
        comparisonCount: 8,
        tierOverride: null,
      },
    ];

    render(<TierListBoard movies={moviesWithOverrides} onSubmit={vi.fn()} />);

    // 2 movies placed (S + B), 1 unranked
    expect(screen.getByText('Unranked (1)')).toBeTruthy();
  });
});
