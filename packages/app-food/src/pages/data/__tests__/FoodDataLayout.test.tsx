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
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { routes } from '../../../routes';

function renderAt(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/food',
        children: routes,
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
    expect(await screen.findByText(/canonical ingredients/i)).toBeInTheDocument();
  });

  it('renders the Aliases tab at /food/data/aliases', async () => {
    renderAt('/food/data/aliases');
    expect(await screen.findByText(/alternate names that resolve/i)).toBeInTheDocument();
  });

  it('renders the Prep states tab at /food/data/prep-states', async () => {
    renderAt('/food/data/prep-states');
    expect(await screen.findByText(/knife and process modifiers/i)).toBeInTheDocument();
  });

  it('renders the Substitutions tab at /food/data/substitutions', async () => {
    renderAt('/food/data/substitutions');
    expect(await screen.findByText(/directed substitution edges/i)).toBeInTheDocument();
  });

  it('renders the Conversions tab as a PRD-123 placeholder', async () => {
    renderAt('/food/data/conversions');
    expect(await screen.findByText(/unit and weight conversions/i)).toBeInTheDocument();
    expect(await screen.findByText(/owned by PRD-123/i)).toBeInTheDocument();
  });

  it('exposes a desktop tablist with one entry per tab', async () => {
    renderAt('/food/data/ingredients');
    const tablist = await screen.findByRole('tablist', { name: /data tabs/i });
    const tabs = tablist.querySelectorAll('a[role="tab"]');
    expect(tabs).toHaveLength(5);
  });

  it('exposes a mobile dropdown with the same set of tabs', async () => {
    renderAt('/food/data/ingredients');
    const dropdown = await screen.findByLabelText(/data tabs/i, { selector: 'select' });
    const options = dropdown.querySelectorAll('option');
    expect(options).toHaveLength(5);
    expect((dropdown as HTMLSelectElement).value).toBe('ingredients');
  });
});
