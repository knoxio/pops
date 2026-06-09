/**
 * Side panel that opens when the user clicks a node in the graph.
 *
 * Shows the focused node's slug + name, then two grouped lists: edges
 * where this node is the `to` side ("These substitute for X") and edges
 * where it is the `from` side ("X substitutes for these"). Read-only;
 * each row links to the corresponding edge detail via `onSelectEdge`.
 */
import { useTranslation } from 'react-i18next';

import { nodeLabel, nodeSlug, partitionEdgesAroundNode } from './helpers';

import type { SubGraphEdge, SubGraphNode } from './types';

export interface NodeDetailPanelProps {
  node: SubGraphNode;
  nodes: readonly SubGraphNode[];
  edges: readonly SubGraphEdge[];
  onSelectEdge: (edge: SubGraphEdge) => void;
  onClose: () => void;
}

export function NodeDetailPanel(props: NodeDetailPanelProps): React.ReactElement {
  const { t } = useTranslation('food');
  const { incoming, outgoing } = partitionEdgesAroundNode(props.edges, props.node);
  const label = nodeLabel(props.node);
  const nodesById = new Map(props.nodes.map((n) => [n.id, n]));
  return (
    <aside
      aria-label={label}
      className="bg-card flex w-80 flex-col gap-4 overflow-y-auto rounded-md border p-4"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{label}</h3>
          <p className="text-muted-foreground text-xs">{nodeSlug(props.node)}</p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <EdgeList
        title={t('data.substitutions.graph.node.incomingTitle', { label })}
        emptyLabel={t('data.substitutions.graph.node.noIncoming')}
        edges={incoming}
        nodesById={nodesById}
        oppositeSide="from"
        onSelectEdge={props.onSelectEdge}
      />
      <EdgeList
        title={t('data.substitutions.graph.node.outgoingTitle', { label })}
        emptyLabel={t('data.substitutions.graph.node.noOutgoing')}
        edges={outgoing}
        nodesById={nodesById}
        oppositeSide="to"
        onSelectEdge={props.onSelectEdge}
      />
    </aside>
  );
}

interface EdgeListProps {
  title: string;
  emptyLabel: string;
  edges: readonly SubGraphEdge[];
  nodesById: Map<string, SubGraphNode>;
  oppositeSide: 'from' | 'to';
  onSelectEdge: (edge: SubGraphEdge) => void;
}

function EdgeList(props: EdgeListProps): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <section className="space-y-2">
      <h4 className="text-foreground text-sm font-semibold">
        {props.title} — {t('data.substitutions.graph.node.count', { count: props.edges.length })}
      </h4>
      {props.edges.length === 0 ? (
        <p className="text-muted-foreground text-sm">{props.emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {props.edges.map((edge) => {
            const otherNodeId = props.oppositeSide === 'from' ? edge.fromNodeId : edge.toNodeId;
            const other = props.nodesById.get(otherNodeId);
            const otherLabel = other ? nodeLabel(other) : otherNodeId;
            const tags = edge.contextTags.length === 0 ? '' : ` · ${edge.contextTags.join(', ')}`;
            return (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => props.onSelectEdge(edge)}
                  className="hover:bg-muted block w-full rounded-md border px-2 py-1 text-left text-sm"
                >
                  <span className="font-medium">{otherLabel}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    ({edge.ratio.toFixed(2)}, {edge.scope}
                    {tags})
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
