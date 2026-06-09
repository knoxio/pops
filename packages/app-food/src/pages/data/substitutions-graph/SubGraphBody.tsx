/**
 * Inner body of the PRD-148 graph explorer. Owns the layout-switch
 * between the force-directed canvas and the radial focus view, plus
 * the empty/loading/error states. Lifted out of `SubGraphPage.tsx` so
 * each file stays under the per-file lint cap.
 */
import { useTranslation } from 'react-i18next';

import { EdgeDetailPanel } from './EdgeDetailPanel';
import { ForceGraphCanvas, type ForceGraphInternalProps } from './ForceGraphCanvas';
import { NodeDetailPanel } from './NodeDetailPanel';
import { RadialFocusView } from './RadialFocusView';

import type { SubGraphEdge, SubGraphNode, SubGraphView } from './types';

const CANVAS_W = 720;
const CANVAS_H = 480;
const TABLE_HREF = '/food/data/substitutions';

export interface SubGraphBodyProps {
  view: SubGraphView;
  isLoading: boolean;
  isError: boolean;
  focusedNode: SubGraphNode | null;
  focusedEdge: SubGraphEdge | null;
  focusedSlug: string | null;
  onSelectNode: (node: SubGraphNode) => void;
  onSelectEdge: (edge: SubGraphEdge) => void;
  onClearSelection: () => void;
  onClearFilters: () => void;
  forceGraphRenderImpl?: (props: ForceGraphInternalProps) => React.ReactElement;
}

export function SubGraphBody(props: SubGraphBodyProps): React.ReactElement {
  const { t } = useTranslation('food');
  if (props.isLoading) {
    return (
      <p className="text-muted-foreground p-6 text-sm">{t('data.substitutions.graph.loading')}</p>
    );
  }
  if (props.isError) {
    return <p className="text-destructive p-6 text-sm">{t('data.substitutions.graph.error')}</p>;
  }
  if (props.view.edges.length === 0) {
    return <EmptyState onClearFilters={props.onClearFilters} />;
  }
  return (
    <div className="flex flex-1 gap-4">
      <section className="bg-card flex-1 rounded-md border">
        {props.focusedSlug !== null && props.focusedNode !== null ? (
          <RadialFocusView
            focus={props.focusedNode}
            nodes={props.view.nodes}
            edges={props.view.edges}
            onNodeClick={props.onSelectNode}
            onEdgeClick={props.onSelectEdge}
          />
        ) : (
          <ForceGraphCanvas
            nodes={props.view.nodes}
            edges={props.view.edges}
            width={CANVAS_W}
            height={CANVAS_H}
            onNodeClick={props.onSelectNode}
            onEdgeClick={props.onSelectEdge}
            renderImpl={props.forceGraphRenderImpl}
          />
        )}
      </section>
      <SidePanel
        focusedNode={props.focusedNode}
        focusedEdge={props.focusedEdge}
        focusedSlug={props.focusedSlug}
        nodes={props.view.nodes}
        edges={props.view.edges}
        onSelectNode={props.onSelectNode}
        onSelectEdge={props.onSelectEdge}
        onClearSelection={props.onClearSelection}
      />
    </div>
  );
}

interface SidePanelProps {
  focusedNode: SubGraphNode | null;
  focusedEdge: SubGraphEdge | null;
  focusedSlug: string | null;
  nodes: readonly SubGraphNode[];
  edges: readonly SubGraphEdge[];
  onSelectNode: (node: SubGraphNode) => void;
  onSelectEdge: (edge: SubGraphEdge) => void;
  onClearSelection: () => void;
}

function SidePanel(props: SidePanelProps): React.ReactElement | null {
  if (props.focusedEdge !== null) {
    return (
      <EdgeDetailPanel
        edge={props.focusedEdge}
        nodes={props.nodes}
        onSelectNode={props.onSelectNode}
        onClose={props.onClearSelection}
        tableEditHref={`${TABLE_HREF}?focus=${props.focusedEdge.id}`}
      />
    );
  }
  if (props.focusedNode !== null) {
    return (
      <NodeDetailPanel
        node={props.focusedNode}
        nodes={props.nodes}
        edges={props.edges}
        onSelectEdge={props.onSelectEdge}
        onClose={props.onClearSelection}
      />
    );
  }
  if (props.focusedSlug !== null) {
    return <NodeNotFound />;
  }
  return null;
}

function EmptyState({ onClearFilters }: { onClearFilters: () => void }): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <p className="text-foreground text-sm font-medium">
        {t('data.substitutions.graph.empty.title')}
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="text-foreground hover:bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
      >
        {t('data.substitutions.graph.empty.clearFilters')}
      </button>
    </div>
  );
}

function NodeNotFound(): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <aside className="bg-card w-80 rounded-md border p-4 text-sm">
      <p className="font-medium">{t('data.substitutions.graph.node.notFound')}</p>
      <p className="text-muted-foreground text-xs">
        {t('data.substitutions.graph.node.notFoundHint')}
      </p>
    </aside>
  );
}
