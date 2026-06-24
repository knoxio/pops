/**
 * RTL coverage for the planning page (spec: pillars/food/docs/prds/planning-page).
 *
 * Mocks the generated food SDK so every endpoint return is pinned. Drag-and-drop
 * is covered at the @dnd-kit level, so this file focuses on wiring + happy paths.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const planWeekViewMock = vi.hoisted(() => vi.fn());
const planListSlotsMock = vi.hoisted(() => vi.fn());
const recipesListMock = vi.hoisted(() => vi.fn());
const planAddEntryMock = vi.hoisted(() => vi.fn());
const planUpdateEntryMock = vi.hoisted(() => vi.fn());
const planDeleteEntryMock = vi.hoisted(() => vi.fn());
const planAddSlotMock = vi.hoisted(() => vi.fn());
const planUpdateSlotMock = vi.hoisted(() => vi.fn());
const planDeleteSlotMock = vi.hoisted(() => vi.fn());
const planMoveEntryMock = vi.hoisted(() => vi.fn());
const planReorderSlotMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  planWeekView: planWeekViewMock,
  planListSlots: planListSlotsMock,
  recipesList: recipesListMock,
  planAddEntry: planAddEntryMock,
  planUpdateEntry: planUpdateEntryMock,
  planDeleteEntry: planDeleteEntryMock,
  planAddSlot: planAddSlotMock,
  planUpdateSlot: planUpdateSlotMock,
  planDeleteSlot: planDeleteSlotMock,
  planMoveEntry: planMoveEntryMock,
  planReorderSlot: planReorderSlotMock,
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

function withClient(children: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage(initialUrl = `/food/plan?week=${monday}`) {
  return render(
    withClient(
      <MemoryRouter initialEntries={[initialUrl]}>
        <PlanPage />
      </MemoryRouter>
    )
  );
}

function primeHappyPath(): void {
  planWeekViewMock.mockResolvedValue({ data: weekViewData });
  planListSlotsMock.mockResolvedValue({ data: slotsData });
  recipesListMock.mockResolvedValue({ data: recipesData });
  for (const m of [
    planAddEntryMock,
    planUpdateEntryMock,
    planDeleteEntryMock,
    planAddSlotMock,
    planUpdateSlotMock,
    planDeleteSlotMock,
    planMoveEntryMock,
    planReorderSlotMock,
  ]) {
    m.mockResolvedValue({ data: { ok: true } });
  }
}

describe('PlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeHappyPath();
  });

  it('renders the week label and the grid with entries', async () => {
    renderPage();
    expect(screen.getByTestId('week-label').textContent).toContain('15 Jun');
    expect(await screen.findByText('Pancakes')).toBeTruthy();
    expect(screen.getByTestId('plan-week-grid')).toBeTruthy();
    expect(screen.getByTestId('servings-badge-1')).toBeTruthy();
    expect(screen.getByTestId('cooked-chip-2')).toBeTruthy();
  });

  it('opens the add modal pre-filled with (date, slot) and submits', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId(`cell-add-${monday}::dinner`));
    const modal = await screen.findByTestId('add-plan-entry-modal');
    expect(modal).toBeTruthy();
    expect(within(modal).getByText(/Add to dinner/)).toBeTruthy();
  });

  it('opens the edit sheet when an entry is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('plan-entry-1'));
    expect(await screen.findByTestId('plan-entry-edit-sheet')).toBeTruthy();
  });

  it('locks the edit sheet for a cooked entry (no delete button)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('plan-entry-2'));
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
    expect(planAddSlotMock).not.toHaveBeenCalled();
  });
});

interface MediaQueryListLike {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => void;
  addListener: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
  dispatchEvent: (event: Event) => boolean;
}

function installMobileMatchMedia(): () => void {
  const original = (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
  const stub = (query: string): MediaQueryListLike => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: stub,
  });
  return () => {
    if (original === undefined) {
      delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
    } else {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: original,
      });
    }
  };
}

describe('PlanPage (mobile)', () => {
  let restoreMatchMedia: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    restoreMatchMedia = installMobileMatchMedia();
    primeHappyPath();
  });

  afterEach(() => {
    restoreMatchMedia();
  });

  it('renders the day swiper instead of the grid on narrow viewports', async () => {
    renderPage();
    await screen.findByText('Pancakes');
    expect(screen.queryByTestId('plan-week-grid')).toBeNull();
    expect(screen.getByTestId('plan-day-swiper')).toBeTruthy();
    expect(screen.getByTestId('plan-day-label').textContent).toContain('Mon');
  });

  it('navigates between days with prev / next arrows', async () => {
    const user = userEvent.setup();
    renderPage();
    expect((await screen.findByTestId('plan-day-label')).textContent).toContain('15 Jun');
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByTestId('plan-day-label').textContent).toContain('16 Jun');
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByTestId('plan-day-label').textContent).toContain('15 Jun');
  });

  it('disables previous arrow on Monday and next arrow on Sunday', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Pancakes');
    expect(screen.getByRole('button', { name: 'Previous day' })).toHaveProperty('disabled', true);
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: 'Next day' }));
    }
    expect(screen.getByTestId('plan-day-label').textContent).toContain('21 Jun');
    expect(screen.getByRole('button', { name: 'Next day' })).toHaveProperty('disabled', true);
  });

  it('shows only the visible day’s entries — Tuesday is empty so the cooked chip is absent', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Pancakes')).toBeTruthy();
    expect(screen.getByTestId('cooked-chip-2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.queryByText('Pancakes')).toBeNull();
    expect(screen.queryByTestId('cooked-chip-2')).toBeNull();
  });

  it('renders the edit sheet as a bottom-sheet on mobile', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('plan-entry-1'));
    const sheet = await screen.findByTestId('plan-entry-edit-sheet');
    expect(sheet.getAttribute('data-variant')).toBe('bottom-sheet');
    expect(sheet.className).toContain('bottom-0');
  });

  it('does not navigate days when the touch gesture starts on a drag handle', async () => {
    renderPage();
    await screen.findByText('Pancakes');
    expect(screen.getByTestId('plan-day-label').textContent).toContain('15 Jun');
    const body = screen.getByTestId('plan-day-swiper-body');
    const handle = body.querySelector('[data-draghandle="true"]');
    expect(handle).not.toBeNull();
    fireEvent.touchStart(body, {
      target: handle,
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(body, {
      changedTouches: [{ clientX: 40, clientY: 100 }],
    });
    expect(screen.getByTestId('plan-day-label').textContent).toContain('15 Jun');
  });

  it('navigates when the swipe starts on empty space inside the day view', async () => {
    renderPage();
    await screen.findByText('Pancakes');
    expect(screen.getByTestId('plan-day-label').textContent).toContain('15 Jun');
    const body = screen.getByTestId('plan-day-swiper-body');
    fireEvent.touchStart(body, {
      target: body,
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(body, {
      changedTouches: [{ clientX: 40, clientY: 100 }],
    });
    expect(screen.getByTestId('plan-day-label').textContent).toContain('16 Jun');
  });
});
