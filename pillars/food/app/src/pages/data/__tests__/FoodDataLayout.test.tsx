/**
 * /food/data shell smoke tests.
 *
 * Drives the layout through `createMemoryRouter` so the `Outlet`
 * + `NavLink` + redirect machinery exercises the real React Router
 * resolution path.
 *
 * The route tree imports tab modules via `React.lazy`, so the
 * RouterProvider is wrapped in a Suspense boundary; without it,
 * runs hit the lazy module's pending promise and `findByText`
 * times out before resolution.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { createMemoryRouter, Navigate, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { FoodDataLayout, getActiveTabSlug } from '../FoodDataLayout';

const slugsSearchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  slugsSearch: slugsSearchMock,
}));

slugsSearchMock.mockResolvedValue({ data: { items: [] } });

function withClient(children: ReactNode): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Mount FoodDataLayout directly (no `React.lazy`) so the tablist/dropdown
// assertions don't race the dynamic imports of the per-tab modules. The
// per-tab content is intentionally stubbed — those flows are exercised
// by each tab's own test file (e.g. IngredientsTab.test.tsx).
function StubTabContent({ slug }: { slug: string }) {
  return <div data-testid={`stub-${slug}`}>{slug}</div>;
}

function renderAt(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/food/data',
        element: <FoodDataLayout />,
        children: [
          { index: true, element: <Navigate to="ingredients" replace /> },
          { path: 'ingredients', element: <StubTabContent slug="ingredients" /> },
          { path: 'aliases', element: <StubTabContent slug="aliases" /> },
          { path: 'prep-states', element: <StubTabContent slug="prep-states" /> },
          { path: 'substitutions', element: <StubTabContent slug="substitutions" /> },
          { path: 'conversions', element: <StubTabContent slug="conversions" /> },
          { path: 'tags', element: <StubTabContent slug="tags" /> },
        ],
      },
    ],
    { initialEntries: [initialPath] }
  );
  return render(
    withClient(
      <Suspense fallback={<div data-testid="lazy-fallback">loading</div>}>
        <RouterProvider router={router} />
      </Suspense>
    )
  );
}

describe('/food/data shell', () => {
  it('redirects /food/data to /food/data/ingredients by default', async () => {
    renderAt('/food/data');
    expect(await screen.findByRole('heading', { name: /manage data/i })).toBeInTheDocument();
    const dropdown = (await screen.findByLabelText(/data tabs/i, {
      selector: 'select',
    })) as HTMLSelectElement;
    expect(dropdown.value).toBe('ingredients');
  });

  it('exposes a desktop tablist with one entry per tab', async () => {
    renderAt('/food/data/ingredients');
    const tablist = await screen.findByRole('tablist', { name: /data tabs/i }, { timeout: 5000 });
    const tabs = tablist.querySelectorAll('a[role="tab"]');
    expect(tabs).toHaveLength(6);
  });

  it('marks the active tab via aria-selected + tabIndex', async () => {
    renderAt('/food/data/aliases');
    const tablist = await screen.findByRole('tablist', { name: /data tabs/i }, { timeout: 5000 });
    const tabs = Array.from(tablist.querySelectorAll<HTMLAnchorElement>('a[role="tab"]'));
    const aliases = tabs.find((a) => a.textContent === 'Aliases');
    const ingredients = tabs.find((a) => a.textContent === 'Ingredients');
    expect(aliases?.getAttribute('aria-selected')).toBe('true');
    expect(aliases?.tabIndex).toBe(0);
    expect(ingredients?.getAttribute('aria-selected')).toBe('false');
    expect(ingredients?.tabIndex).toBe(-1);
  });

  describe('getActiveTabSlug — leading-segment match', () => {
    it('resolves the slug from a direct match', () => {
      expect(getActiveTabSlug('/food/data/aliases')).toBe('aliases');
      expect(getActiveTabSlug('/food/data/prep-states')).toBe('prep-states');
    });

    it('keeps the parent tab active when the URL has a nested sub-route', () => {
      expect(getActiveTabSlug('/food/data/aliases/123/edit')).toBe('aliases');
    });

    it('falls back to the default tab when no segment matches', () => {
      expect(getActiveTabSlug('/food/data/mystery')).toBe('ingredients');
      expect(getActiveTabSlug('/food/data')).toBe('ingredients');
    });
  });

  it('exposes a mobile dropdown with the same set of tabs', async () => {
    renderAt('/food/data/ingredients');
    const dropdown = await screen.findByLabelText(
      /data tabs/i,
      { selector: 'select' },
      { timeout: 5000 }
    );
    const options = dropdown.querySelectorAll('option');
    expect(options).toHaveLength(6);
    expect((dropdown as HTMLSelectElement).value).toBe('ingredients');
  });
});
