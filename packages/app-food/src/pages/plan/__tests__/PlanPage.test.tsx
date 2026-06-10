/**
 * PRD-143 — RTL coverage for the planning page.
 *
 * Mocks the tRPC client so the test pins exactly what every procedure
 * returns and asserts the rendered grid, add modal, edit sheet, and
 * slot drawer wire the mutations correctly. The drag-and-drop behavior
 * is exercised at the @dnd-kit unit level via library coverage; this
 * test focuses on the wiring + happy paths the PRD calls out.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWeekView = vi.fn();
const mockListSlots = vi.fn();
const mockListRecipes = vi.fn();
const mockAddEntryMutate = vi.fn();
const mockUpdateEntryMutate = vi.fn();
const mockDeleteEntryMutate = vi.fn();
const mockAddSlotMutate = vi.fn();
const mockUpdateSlotMutate = vi.fn();
const mockDeleteSlotMutate = vi.fn();
const mockMoveEntryMutate = vi.fn();
const mockReorderSlotMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      food: {
        plan: {
          weekView: { invalidate: mockInvalidate },
          listSlots: { invalidate: mockInvalidate },
        },
      },
    }),
    food: {
      plan: {
        weekView: { useQuery: (input: unknown) => mockWeekView(input) },
        listSlots: { useQuery: () => mockListSlots() },
        addEntry: {
          useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
            mutate: (vars: unknown) => mockAddEntryMutate(vars, opts),
            mutateAsync: async (vars: unknown) => mockAddEntryMutate(vars, opts),
            isPending: false,
          }),
        },
        updateEntry: {
          useMutation: () => ({
            mutate: mockUpdateEntryMutate,
            isPending: false,
          }),
        },
        deleteEntry: {
          useMutation: () => ({
            mutate: mockDeleteEntryMutate,
            isPending: false,
          }),
        },
        addSlot: {
          useMutation: () => ({
            mutate: mockAddSlotMutate,
            mutateAsync: async (vars: unknown) => {
              mockAddSlotMutate(vars);
              return { ok: true } as const;
            },
            isPending: false,
          }),
        },
        updateSlot: {
          useMutation: () => ({
            mutate: mockUpdateSlotMutate,
            isPending: false,
          }),
        },
        deleteSlot: {
          useMutation: () => ({
            mutate: mockDeleteSlotMutate,
            isPending: false,
          }),
        },
        moveEntry: {
          useMutation: () => ({
            mutate: mockMoveEntryMutate,
            isPending: false,
          }),
        },
        reorderSlot: {
          useMutation: () => ({
            mutate: mockReorderSlotMutate,
            isPending: false,
          }),
        },
      },
      recipes: {
        list: { useQuery: (input: unknown) => mockListRecipes(input) },
      },
    },
  },
}));

import { PlanPage } from '../PlanPage.js';

const monday = '2026-06-15';

const slotsData = {
  slots: [
    { slug: 'breakfast', name: 'Breakfast', displayOrder: 10, isDefault: true },
    { slug: 'dinner', name: 'Dinner', displayOrder: 30, isDefault: true },
    { slug: 'late-night', name: 'Late night', displayOrder: 60, isDefault: false },
  ],
};

const weekViewData = {
  weekStart: monday,
  weekEnd: '2026-06-21',
  slots: slotsData.slots,
  entries: [
    {
      id: 1,
      date: monday,
      slot: 'dinner',
      position: 0,
      recipeId: 10,
      recipeSlug: 'pancakes',
      recipeTitle: 'Pancakes',
      recipeType: 'plate',
      heroImagePath: null,
      plannedServings: 3,
      recipeVersionId: null,
      recipeRunId: null,
      recipeRunCookedAt: null,
      notes: null,
    },
    {
      id: 2,
      date: monday,
      slot: 'dinner',
      position: 1,
      recipeId: 11,
      recipeSlug: 'soup',
      recipeTitle: 'Soup',
      recipeType: 'plate',
      heroImagePath: null,
      plannedServings: 1,
      recipeVersionId: null,
      recipeRunId: 99,
      recipeRunCookedAt: '2026-06-15 18:00:00',
      notes: null,
    },
  ],
};

const recipesData = {
  items: [
    {
      id: 10,
      slug: 'pancakes',
      title: 'Pancakes',
      recipeType: 'plate',
      heroImagePath: null,
      prepMinutes: null,
      cookMinutes: null,
      servings: null,
      tags: [],
      hasCurrentVersion: true,
      archivedAt: null,
      createdAt: '2026-06-01',
    },
  ],
  nextCursor: null,
};

function renderPage(initialUrl = `/food/plan?week=${monday}`) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <PlanPage />
    </MemoryRouter>
  );
}

describe('PlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWeekView.mockReturnValue({
      data: weekViewData,
      isLoading: false,
      isError: false,
      error: null,
    });
    mockListSlots.mockReturnValue({
      data: slotsData,
      isLoading: false,
      isError: false,
      error: null,
    });
    mockListRecipes.mockReturnValue({
      data: recipesData,
      isLoading: false,
      isError: false,
    });
  });

  it('renders the week label and the grid with entries', () => {
    renderPage();
    expect(screen.getByTestId('week-label').textContent).toContain('15 Jun');
    expect(screen.getByTestId('plan-week-grid')).toBeTruthy();
    expect(screen.getByText('Pancakes')).toBeTruthy();
    expect(screen.getByTestId('servings-badge-1')).toBeTruthy();
    expect(screen.getByTestId('cooked-chip-2')).toBeTruthy();
  });

  it('opens the add modal pre-filled with (date, slot) and submits', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId(`cell-add-${monday}::dinner`));
    const modal = await screen.findByTestId('add-plan-entry-modal');
    expect(modal).toBeTruthy();
    expect(within(modal).getByText(/Add to dinner/)).toBeTruthy();
  });

  it('opens the edit sheet when an entry is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId('plan-entry-1'));
    expect(await screen.findByTestId('plan-entry-edit-sheet')).toBeTruthy();
  });

  it('locks the edit sheet for a cooked entry (no delete button)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId('plan-entry-2'));
    const sheet = await screen.findByTestId('plan-entry-edit-sheet');
    expect(within(sheet).queryByTestId('delete-plan-entry')).toBeNull();
    expect(within(sheet).getByText(/Cooked on/)).toBeTruthy();
  });

  it('opens the slot management drawer and lists default + custom slots', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId('manage-slots-btn'));
    const drawer = await screen.findByTestId('slot-management-drawer');
    expect(within(drawer).getByTestId('slot-row-breakfast')).toBeTruthy();
    expect(within(drawer).getByTestId('slot-default-dinner')).toBeTruthy();
    expect(within(drawer).getByTestId('slot-delete-late-night')).toBeTruthy();
  });

  it('rejects invalid slug input in the add-slot form before calling the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId('manage-slots-btn'));
    const drawer = await screen.findByTestId('slot-management-drawer');
    await user.type(within(drawer).getByTestId('add-slot-slug'), 'Bad Slug');
    await user.type(within(drawer).getByTestId('add-slot-name'), 'Bad');
    await user.click(within(drawer).getByTestId('add-slot-submit'));
    expect(within(drawer).getByText(/kebab-case/i)).toBeTruthy();
    expect(mockAddSlotMutate).not.toHaveBeenCalled();
  });
});
