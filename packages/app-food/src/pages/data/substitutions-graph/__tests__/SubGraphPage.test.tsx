/**
 * PRD-148 — SubGraphPage RTL suite.
 *
 * Drives the page through `createMemoryRouter` so the `useSearchParams`
 * + URL-state machinery exercises React Router's real resolution path.
 * The `food.substitutions.graphView` tRPC query is mocked at the
 * `@pops/api-client` module boundary; the force-directed canvas is
 * substituted via `forceGraphRenderImpl` so vitest doesn't need a real
 * `HTMLCanvasElement`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForceGraphInternalProps } from '../ForceGraphCanvas';
import type { SubGraphEdge, SubGraphNode, SubGraphView } from '../types';

const refetchFn = vi.fn();
const graphViewState: {
  data: SubGraphView | undefined;
  isLoading: boolean;
  isError: boolean;
  lastInput: unknown;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  lastInput: undefined,
};

vi.mock('@pops/api-client', () => ({
  trpc: {
    food: {
      substitutions: {
        graphView: {
          useQuery: (input: unknown, _opts?: unknown) => {
            graphViewState.lastInput = input;
            return {
              data: graphViewState.data,
              isLoading: graphViewState.isLoading,
              isError: graphViewState.isError,
              refetch: refetchFn,
            };
          },
        },
      },
    },
  },
}));

import { SubGraphPage } from '../SubGraphPage';

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
  return render(
    <Suspense fallback={<div>loading</div>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

beforeEach(() => {
  graphViewState.data = undefined;
  graphViewState.isLoading = false;
  graphViewState.isError = false;
  graphViewState.lastInput = undefined;
  refetchFn.mockReset();
});

describe('SubGraphPage', () => {
  it('renders the graph header + nodes + edges from the fixture', () => {
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
    expect(screen.getByRole('button', { name: 'node:Butter' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'node:Butter' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'edge:11' }));
    await waitFor(() => {
      const panels = screen.getAllByRole('complementary');
      const detail = panels.find((p) => p.textContent?.includes('Ratio'));
      expect(detail).toBeDefined();
      expect(detail?.textContent).toContain('0.75');
      expect(detail?.textContent?.toLowerCase()).toContain('global');
    });
  });

  it('passes header filters into the tRPC query input', () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph?scope=global&contextTag=baking&q=butter');
    expect(graphViewState.lastInput).toMatchObject({
      scope: 'global',
      contextTag: 'baking',
      search: 'butter',
    });
  });

  it('shows the recipe-picker pending placeholder when scope=recipe and no recipeId', () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph?scope=recipe');
    expect(screen.getByText(/recipe picker arrives with PRD-119/i)).toBeInTheDocument();
  });

  it('renders the radial focus view when ?node=<slug> is present', () => {
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [butter, olive],
      edges: [makeEdge(11, butter, olive, { ratio: 0.75 })],
    };
    renderAt('/food/data/substitutions/graph?node=butter');
    expect(screen.getByRole('img', { name: /radial view: butter/i })).toBeInTheDocument();
    // The stub force graph should NOT be rendered in radial mode.
    expect(screen.queryByTestId('stub-force-graph')).toBeNull();
  });

  it('opens the edge detail panel on initial load when ?edge=<id> is present', () => {
    const butter = makeIngredientNode(3, 'butter', 'Butter');
    const olive = makeIngredientNode(4, 'olive-oil', 'Olive oil');
    graphViewState.data = {
      nodes: [butter, olive],
      edges: [makeEdge(11, butter, olive, { ratio: 0.5, contextTags: ['savory'] })],
    };
    renderAt('/food/data/substitutions/graph?edge=11');
    const panel = screen.getByRole('complementary', { name: /substitution detail/i });
    expect(panel.textContent).toContain('0.50');
    expect(panel.textContent).toContain('savory');
  });

  it('shows the empty state when the filtered view has zero edges', () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph');
    expect(screen.getByText(/no substitutions match your filters/i)).toBeInTheDocument();
  });

  it('view-as-table link points back to the substitutions tab', () => {
    graphViewState.data = { nodes: [], edges: [] };
    renderAt('/food/data/substitutions/graph');
    const link = screen.getByRole('link', { name: /view as table/i });
    expect(link).toHaveAttribute('href', '/food/data/substitutions');
  });
});
