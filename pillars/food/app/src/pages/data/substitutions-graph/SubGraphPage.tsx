/**
 * `/food/data/substitutions/graph`.
 *
 * Top-level page. Lifts header filters and side-panel selection into URL
 * search params so the page is shareable + back-navigable. The graphView
 * query returns the minimum spanning subgraph for the current filters;
 * node/edge selection drives which side panel is shown.
 *
 * State model:
 *   - `?scope` (default `global`) drives header + query.
 *   - `?recipeId` is read but the recipe picker UI is not built yet;
 *     selecting `scope=recipe` shows a placeholder instead of a graph.
 *   - `?contextTag` / `?q` drive the context dropdown + search box.
 *   - `?node=<slug>` triggers the radial focus view + node side panel.
 *   - `?edge=<id>` opens the edge side panel on load.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { unwrap } from '../../../food-api-helpers.js';
import { substitutionsGraphView } from '../../../food-api/index.js';
import { distinctContextTags, findNodeBySlug } from './helpers';
import { SubGraphBody } from './SubGraphBody';
import { SubGraphHeader } from './SubGraphHeader';
import { useSubGraphState } from './useSubGraphState';

import type { SubstitutionsGraphViewResponses } from '../../../food-api/types.gen.js';
import type { ForceGraphInternalProps } from './ForceGraphCanvas';
import type { SubGraphView } from './types';

type GraphViewOutput = SubstitutionsGraphViewResponses[200];

const TABLE_HREF = '/food/data/substitutions';

export interface SubGraphPageProps {
  /**
   * Renderer override for the force-directed canvas. Tests pass a
   * deterministic substitute that exposes nodes / edges as buttons so
   * vitest doesn't need a real `HTMLCanvasElement`.
   */
  forceGraphRenderImpl?: (props: ForceGraphInternalProps) => React.ReactElement;
}

export function SubGraphPage(props: SubGraphPageProps = {}): React.ReactElement {
  const { t } = useTranslation('food');
  const state = useSubGraphState();
  const { filters } = state;
  const skipQuery = filters.scope === 'recipe' && filters.recipeId === null;
  const query = useQuery({
    queryKey: ['food', 'substitutions', 'graphView', state.queryInput],
    queryFn: async (): Promise<GraphViewOutput> =>
      unwrap(await substitutionsGraphView({ query: state.queryInput })),
    enabled: !skipQuery,
  });
  const view: SubGraphView = query.data ?? { nodes: [], edges: [] };
  const focusedNode =
    filters.focusedSlug !== null ? findNodeBySlug(view.nodes, filters.focusedSlug) : null;
  const focusedEdge =
    filters.focusedEdgeId !== null
      ? (view.edges.find((e) => e.id === Number(filters.focusedEdgeId)) ?? null)
      : null;

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col gap-4">
      <SubGraphHeader
        scope={filters.scope}
        onScopeChange={(s) => state.updateParam('scope', s === 'global' ? null : s)}
        contextTag={filters.contextTag}
        onContextTagChange={(tag) => state.updateParam('contextTag', tag)}
        availableContextTags={distinctContextTags(view.edges)}
        search={filters.search}
        onSearchChange={(s) => state.updateParam('q', s === '' ? null : s)}
        onRefresh={() => void query.refetch()}
        tableHref={TABLE_HREF}
      />
      {skipQuery ? (
        <RecipePickerPlaceholder placeholder={t('data.substitutions.graph.recipePickerPending')} />
      ) : (
        <SubGraphBody
          view={view}
          isLoading={query.isLoading}
          isError={query.isError}
          focusedNode={focusedNode}
          focusedEdge={focusedEdge}
          focusedSlug={filters.focusedSlug}
          onSelectNode={state.selectNode}
          onSelectEdge={state.selectEdge}
          onClearSelection={state.clearSelection}
          onClearFilters={state.clearAllFilters}
          forceGraphRenderImpl={props.forceGraphRenderImpl}
        />
      )}
    </div>
  );
}

function RecipePickerPlaceholder({ placeholder }: { placeholder: string }): React.ReactElement {
  return (
    <div className="bg-muted/30 flex flex-1 items-center justify-center rounded-md p-6">
      <p className="text-muted-foreground max-w-sm text-center text-sm">{placeholder}</p>
    </div>
  );
}
