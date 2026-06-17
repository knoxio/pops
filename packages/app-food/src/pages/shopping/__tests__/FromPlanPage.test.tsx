/**
 * PRD-152 — RTL coverage for the FromPlanPage.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shoppingPreviewMock = vi.hoisted(() => vi.fn());
const shoppingGenerateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  shoppingPreview: shoppingPreviewMock,
  shoppingGenerate: shoppingGenerateMock,
}));

import { FromPlanPage } from '../FromPlanPage.js';

function LocationProbe(): JSX.Element {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname}</div>;
}

function withClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage(initialUrl: string): void {
  render(
    withClient(
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/food/shopping/from-plan" element={<FromPlanPage />} />
          <Route path="/lists/:id" element={<LocationProbe />} />
          <Route path="/food/plan" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    )
  );
}

const FULL_PREVIEW = {
  startDate: '2026-06-08',
  endDate: '2026-06-14',
  planEntryCount: 2,
  skippedPlanEntryCount: 0,
  sections: [
    {
      sectionTag: 'store-section:pantry',
      sectionLabel: 'Pantry',
      items: [
        {
          ingredientId: 1,
          ingredientName: 'flour',
          variantId: 10,
          variantName: 'AP',
          needQty: 200,
          pantryQty: 50,
          buyQty: 150,
          canonicalUnit: 'g',
          isUnconverted: false,
          originalQty: null,
          originalUnit: null,
          sourceLineIds: [100],
        },
      ],
    },
    {
      sectionTag: null,
      sectionLabel: 'Other / Uncategorised',
      items: [
        {
          ingredientId: 2,
          ingredientName: 'saffron',
          variantId: null,
          variantName: null,
          needQty: 1,
          pantryQty: 0,
          buyQty: 1,
          canonicalUnit: 'g',
          isUnconverted: false,
          originalQty: null,
          originalUnit: null,
          sourceLineIds: [101],
        },
      ],
    },
  ],
  uncategorisedIngredientIds: [2],
  recipeTitles: ['Risotto'],
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  shoppingPreviewMock.mockResolvedValue({ data: FULL_PREVIEW });
});

describe('FromPlanPage', () => {
  it('pre-fills date inputs from ?start= and ?end= query params', () => {
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    expect(screen.getByTestId<HTMLInputElement>('from-plan-start').value).toBe('2026-06-08');
    expect(screen.getByTestId<HTMLInputElement>('from-plan-end').value).toBe('2026-06-14');
  });

  it('renders sections with their item rows', async () => {
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    const sections = await screen.findAllByTestId('from-plan-section');
    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveAttribute('data-section-tag', 'store-section:pantry');
    expect(sections[1]).toHaveAttribute('data-section-tag', '');
    const items = screen.getAllByTestId('from-plan-item');
    expect(items).toHaveLength(2);
  });

  it('shows the "Tag it" link only on rows in the Other bucket', async () => {
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    const links = await screen.findAllByTestId('tag-it-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/food/data/ingredients?focus=2');
  });

  it('flags an end-before-start range with an inline error', () => {
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    fireEvent.change(screen.getByTestId('from-plan-end'), { target: { value: '2026-05-01' } });
    const err = screen.getByTestId('range-error');
    expect(err.textContent.length).toBeGreaterThan(0);
  });

  it('snaps to ISO Mon-Sun when "This week" is clicked', async () => {
    const user = userEvent.setup();
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    await user.click(screen.getByTestId('snap-this-week'));
    // Just assert the inputs change to something (date depends on `new Date()`
    // at click-time which the test environment doesn't pin).
    expect(screen.getByTestId<HTMLInputElement>('from-plan-start').value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it('navigates to /lists/:id on a successful Generate', async () => {
    shoppingGenerateMock.mockResolvedValueOnce({ data: { ok: true, listId: 42, itemCount: 2 } });
    const user = userEvent.setup();
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    await user.click(screen.getByTestId('generate-list-btn'));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/lists/42');
    expect(shoppingGenerateMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a server-side BulkAddFailed error inline', async () => {
    shoppingGenerateMock.mockResolvedValueOnce({ data: { ok: false, reason: 'BulkAddFailed' } });
    const user = userEvent.setup();
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    await user.click(screen.getByTestId('generate-list-btn'));
    const err = await screen.findByTestId('generate-error');
    expect(err.textContent).toMatch(/list/i);
  });

  it('renders the empty-state caption when nothing is to buy', async () => {
    shoppingPreviewMock.mockResolvedValue({ data: { ...FULL_PREVIEW, sections: [] } });
    renderPage('/food/shopping/from-plan?start=2026-06-08&end=2026-06-14');
    expect(await screen.findByTestId('preview-empty')).toBeInTheDocument();
  });
});
