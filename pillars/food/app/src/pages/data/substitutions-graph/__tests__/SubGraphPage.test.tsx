/**
 * SubGraphPage RTL suite (pillars/food/docs/prds/substitution-graph-explorer).
 *
 * Drives the page through `createMemoryRouter` so the `useSearchParams`
 * + URL-state machinery exercises React Router's real resolution path.
 * The `substitutionsGraphView` SDK call is mocked at the generated
 * `food-api` module boundary; the force-directed canvas is substituted
 * via `forceGraphRenderImpl` so vitest doesn't need a real
 * `HTMLCanvasElement`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForceGraphInternalProps } from '../ForceGraphCanvas';
import type { SubGraphEdge, SubGraphNode, SubGraphView } from '../types';

const substitutionsGraphViewMock = vi.hoisted(() => vi.fn());

const graphViewState: { data: SubGraphView | undefined } = {
  data: undefined,
};

vi.mock('../../../../food-api/index.js', () => ({
  substitutionsGraphView: substitutionsGraphViewMock,
}));

substitutionsGraphViewMock.mockImplementation(async () => ({
  data: graphViewState.data ?? { nodes: [], edges: [] },
}));

import { SubGraphPage } from '../SubGraphPage';

function lastGraphQuery(): {
  scope?: string;
  contextTag?: string;
  search?: string;
  recipeId?: number;
} {
  const call = substitutionsGraphViewMock.mock.lastCall;
  return (call?.[0]?.query ?? {}) as {
    scope?: string;
    contextTag?: string;
    search?: string;
    recipeId?: number;
  };
}

function makeIngredientNode(id: number, slug: string, name: string): SubGraphNode {
  return {
    id: `ingredient:${id}`,
    kind: 'ingredient',
    ingredientId: id,
    variantId: null,
    ingredientSlug: slug,
    ingredientName: name,
    variantSlug: null,
    variantName: null,
  };
}

function makeEdge(
  id: number,
  from: SubGraphNode,
  to: SubGraphNode,
  patch: Partial<SubGraphEdge> = {}
): SubGraphEdge {
  return {
    id,
    fromNodeId: from.id,
    toNodeId: to.id,
    ratio: 1,
    contextTags: [],
    scope: 'global',
    recipeId: null,
    recipeSlug: null,
    notes: null,
    ...patch,
  };
}

function StubForceGraph(props: ForceGraphInternalProps): React.ReactElement {
  return (
    <div data-testid="stub-force-graph">
      <ul>
        {props.nodes.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => props.onNodeClick(n)}>
              node:{n.label}
            </button>
          </li>
        ))}
      </ul>
      <ul>
        {props.edges.map((l) => (
          <li key={l.edge.id}>
            <button type="button" onClick={() => props.onEdgeClick(l.edge)}>
              edge:{l.edge.id}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderAt(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/food/data/substitutions/graph',
        element: <SubGraphPage forceGraphRenderImpl={StubForceGraph} />,
      },
    ],
    { initialEntries: [initialPath] }
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Suspense fallback={<div>loading</div>}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Suspense>
  );
}

beforeEach(() => {
  graphViewState.data = undefined;
  substitutionsGraphViewMock.mockClear();
});

describe('SubGraphPage', () => {
  it('renders the graph header + nodes + edges from the fixture', async () => {
    const banana = makeIngredientNode(1, 'banana', 'Banana');
    const apple = makeIngredientNode(2, 'apple', 'Apple');
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [banana, apple, butter, olive],
      edges: [
        makeEdge(11, butter, olive, { ratio: 0.75, contextTags: ['savory'] }),
        makeEdge(12, banana, apple),
      ],
    };
    renderAt('/food/data/substitutions/graph');
    expect(screen.getByRole('heading', { name: /substitution graph/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'node:Butter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'node:Olive oil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'edge:11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'edge:12' })).toBeInTheDocument();
  });

  it('opens the node detail panel on node click and lists outgoing subs', async () => {
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [butter, olive],
      edges: [makeEdge(11, butter, olive, { ratio: 0.75 })],
    };
    renderAt('/food/data/substitutions/graph');
    fireEvent.click(await screen.findByRole('button', { name: 'node:Butter' }));
    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Butter' })).toBeInTheDocument();
    });
    const panel = screen.getByRole('complementary', { name: 'Butter' });
    expect(panel.textContent).toContain('Olive oil');
    expect(panel.textContent).toContain('0.75');
  });

  it('opens the edge detail panel on edge click with ratio + scope', async () => {
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [butter, olive],
      edges: [makeEdge(11, butter, olive, { ratio: 0.75, scope: 'global' })],
    };
    renderAt('/food/data/substitutions/graph');
    fireEvent.click(await screen.findByRole('button', { name: 'edge:11' }));
    await waitFor(() => {
      const panels = screen.getAllByRole('complementary');
      const detail = panels.find((p) => p.textContent?.includes('Ratio'));
      expect(detail).toBeDefined();
      expect(detail?.textContent).toContain('0.75');
      expect(detail?.textContent?.toLowerCase()).toContain('global');
    });
  });

  it('passes header filters into the graphView query input', async () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph?scope=global&contextTag=baking&q=butter');
    await waitFor(() => {
      expect(lastGraphQuery()).toMatchObject({
        scope: 'global',
        contextTag: 'baking',
        search: 'butter',
      });
    });
  });

  it('shows the recipe-picker pending placeholder when scope=recipe and no recipeId', () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph?scope=recipe');
    expect(screen.getByText(/recipe picker arrives with PRD-119/i)).toBeInTheDocument();
  });

  it('renders the radial focus view when ?node=<slug> is present', async () => {
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [butter, olive],
      edges: [makeEdge(11, butter, olive, { ratio: 0.75 })],
    };
    renderAt('/food/data/substitutions/graph?node=butter');
    expect(await screen.findByRole('img', { name: /radial view: butter/i })).toBeInTheDocument();
    expect(screen.queryByTestId('stub-force-graph')).toBeNull();
  });

  it('opens the edge detail panel on initial load when ?edge=<id> is present', async () => {
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [butter, olive],
      edges: [makeEdge(11, butter, olive, { ratio: 0.5, contextTags: ['savory'] })],
    };
    renderAt('/food/data/substitutions/graph?edge=11');
    const panel = await screen.findByRole('complementary', { name: /substitution detail/i });
    expect(panel.textContent).toContain('0.50');
    expect(panel.textContent).toContain('savory');
  });

  it('shows the empty state when the filtered view has zero edges', async () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph');
    expect(await screen.findByText(/no substitutions match your filters/i)).toBeInTheDocument();
  });

  it('view-as-table link points back to the substitutions tab', () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph');
    const link = screen.getByRole('link', { name: /view as table/i });
    expect(link).toHaveAttribute('href', '/food/data/substitutions');
  });

  it('empty state surfaces a "Clear filters" action that resets URL params', async () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph?scope=global&contextTag=baking&q=butter');
    const clear = await screen.findByRole('button', { name: /clear filters/i });
    expect(clear).toBeInTheDocument();
    fireEvent.click(clear);
    await waitFor(() => {
      const input = lastGraphQuery();
      expect(input).toMatchObject({ scope: 'global' });
      expect(input.contextTag).toBeUndefined();
      expect(input.search).toBeUndefined();
    });
  });

  it('coerces invalid URL params to safe defaults', async () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph?scope=bogus&recipeId=not-a-number&contextTag=');
    // Bogus scope falls back to 'global'; NaN recipeId drops out; empty
    // contextTag is treated as null and never reaches the query input.
    await waitFor(() => {
      const input = lastGraphQuery();
      expect(input).toMatchObject({ scope: 'global' });
      expect(input.recipeId).toBeUndefined();
      expect(input.contextTag).toBeUndefined();
    });
  });

  it('debounces the search input by 200ms before pushing it into the query', async () => {
    vi.useFakeTimers();
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph');
    const searchBox = screen.getByPlaceholderText(/search ingredients/i);
    fireEvent.change(searchBox, { target: { value: 'b' } });
    fireEvent.change(searchBox, { target: { value: 'bu' } });
    fireEvent.change(searchBox, { target: { value: 'but' } });
    // No query update should have fired yet — the search box is local state, not URL.
    expect(lastGraphQuery().search).toBeUndefined();
    vi.advanceTimersByTime(220);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    await waitFor(() => {
      expect(lastGraphQuery().search).toBe('but');
    });
  });
});
