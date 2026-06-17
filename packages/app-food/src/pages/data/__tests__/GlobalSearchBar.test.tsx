import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearchBar } from '../GlobalSearchBar';

const slugsSearchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  slugsSearch: slugsSearchMock,
}));

function withClient(children: ReactNode): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function PathProbe({ paths }: { paths: string[] }) {
  return <div data-testid="probe">{paths.join('|')}</div>;
}

function renderInRouter(initialPath: string) {
  const visited: string[] = [];
  const router = createMemoryRouter(
    [
      {
        path: '/food/data',
        element: (
          <>
            <GlobalSearchBar />
            <PathProbe paths={visited} />
          </>
        ),
        children: [
          { path: 'ingredients', element: <span data-testid="ingredients">ing</span> },
          { path: 'prep-states', element: <span data-testid="prep-states">prep</span> },
        ],
      },
    ],
    { initialEntries: [initialPath] }
  );
  router.subscribe((state) => {
    visited.push(`${state.location.pathname}${state.location.search}`);
  });
  const utils = render(
    withClient(
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    )
  );
  return { ...utils, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  slugsSearchMock.mockResolvedValue({ data: { items: [] } });
});

describe('PRD-122-D — GlobalSearchBar', () => {
  it('renders a search input with the data-search testid', () => {
    renderInRouter('/food/data/ingredients');
    expect(screen.getByTestId('food-data-global-search')).toBeInTheDocument();
  });

  it('shows the empty hint when no matches return', async () => {
    slugsSearchMock.mockResolvedValue({ data: { items: [] } });
    renderInRouter('/food/data/ingredients');
    await userEvent.type(screen.getByPlaceholderText(/search ingredients/i), 'xyz');
    expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
  });

  it('clicking an ingredient result navigates to /food/data/ingredients?focus=<slug>', async () => {
    slugsSearchMock.mockResolvedValue({ data: {
        items: [{ slug: 'butter', kind: 'ingredient', targetId: 100, name: 'Butter' }],
      } });
    const { router } = renderInRouter('/food/data/ingredients');
    await userEvent.type(screen.getByPlaceholderText(/search ingredients/i), 'but');
    const option = await screen.findByRole('option', { name: /butter/i });
    await userEvent.click(option);
    expect(router.state.location.pathname).toBe('/food/data/ingredients');
    expect(router.state.location.search).toBe('?focus=butter');
  });

  it('clicking a prep_state result navigates to /food/data/prep-states', async () => {
    slugsSearchMock.mockResolvedValue({ data: {
        items: [{ slug: 'diced', kind: 'prep_state', targetId: 5, name: 'Diced' }],
      } });
    const { router } = renderInRouter('/food/data/ingredients');
    await userEvent.type(screen.getByPlaceholderText(/search ingredients/i), 'dic');
    const option = await screen.findByRole('option', { name: /diced/i });
    await userEvent.click(option);
    expect(router.state.location.pathname).toBe('/food/data/prep-states');
    expect(router.state.location.search).toBe('?focus=diced');
  });

  it('recipe results are shown with a badge but disabled (no recipe tab yet)', async () => {
    slugsSearchMock.mockResolvedValue({ data: {
        items: [{ slug: 'weeknight-pasta', kind: 'recipe', targetId: 1, name: 'Weeknight Pasta' }],
      } });
    renderInRouter('/food/data/ingredients');
    await userEvent.type(screen.getByPlaceholderText(/search ingredients/i), 'weeknight');
    const option = await screen.findByRole('option', { name: /weeknight pasta/i });
    expect(option).toBeDisabled();
  });
});
