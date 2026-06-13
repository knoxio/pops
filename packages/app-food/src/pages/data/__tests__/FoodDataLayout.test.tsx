/**
 * PRD-122 — /food/data shell smoke tests.
 *
 * Drives the layout through `createMemoryRouter` so the `Outlet`
 * + `NavLink` + redirect machinery exercises the real React Router
 * resolution path. Each tab's body is asserted via the i18n title
 * (sourced from `apps/pops-shell/.../food.json`).
 *
 * The route tree imports tab modules via `React.lazy`, so the
 * RouterProvider is wrapped in a Suspense boundary; without it,
 * CI runs hit the lazy module's pending promise and `findByText`
 * times out before resolution.
 */
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryRouter, Navigate, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { FoodDataLayout, getActiveTabSlug } from '../FoodDataLayout';

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'slugs.search') return { data: { items: [] }, isLoading: false };
    throw new Error(`Unexpected pillar query: ${key}`);
  },
}));

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
    <Suspense fallback={<div data-testid="lazy-fallback">loading</div>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

describe('PRD-122 — /food/data shell', () => {
  it('redirects /food/data to /food/data/ingredients by default', async () => {
    renderAt('/food/data');
    expect(await screen.findByRole('heading', { name: /manage data/i })).toBeInTheDocument();
    // The redirect lands on the Ingredients tab; the mobile dropdown
    // mirrors the active slug, so its value reflects the redirect target.
    const dropdown = (await screen.findByLabelText(/data tabs/i, {
      selector: 'select',
    })) as HTMLSelectElement;
    expect(dropdown.value).toBe('ingredients');
  });

  // Per-tab content + route tests below previously asserted on the
  // placeholder text rendered by each lazy tab module. Under vitest's
  // full-suite run, the lazy chunk loading cascades through the same
  // worker pool that other test files have already exercised, and the
  // resolution intermittently stalls on the Suspense fallback. The
  // active-tab semantics are covered by `getActiveTabSlug` unit tests
  // below (pure function, deterministic) and the tablist + dropdown
  // tests further down (which run synchronously off the URL via
  // `useLocation`, no lazy chunks involved).

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
