/**
 * Force-directed graph canvas — wraps `react-force-graph-2d`.
 *
 * Tests + Storybook pass a `renderImpl` substitute that exposes nodes
 * and edges as plain DOM so vitest doesn't need a real
 * `HTMLCanvasElement` to drive the click handlers. The production path
 * mounts the lib directly because `React.lazy` collapses its generic
 * parameters to the `{}` default, which loses the typed graph data
 * accessor signatures.
 */
import { useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useTranslation } from 'react-i18next';

import { edgeThicknessPx, edgeThickness, nodeLabel } from './helpers';

import type { LinkObject, NodeObject } from 'react-force-graph-2d';

import type { SubGraphEdge, SubGraphNode } from './types';

export interface ForceGraphCanvasProps {
  nodes: readonly SubGraphNode[];
  edges: readonly SubGraphEdge[];
  width: number;
  height: number;
  onNodeClick: (node: SubGraphNode) => void;
  onEdgeClick: (edge: SubGraphEdge) => void;
  /** Substitute renderer for tests / Storybook. */
  renderImpl?: (props: ForceGraphInternalProps) => React.ReactElement;
}

export interface ForceGraphInternalProps {
  nodes: ForceGraphNodeDatum[];
  edges: ForceGraphEdgeDatum[];
  width: number;
  height: number;
  onNodeClick: (node: SubGraphNode) => void;
  onEdgeClick: (edge: SubGraphEdge) => void;
}

interface ForceGraphNodeDatum extends SubGraphNode {
  label: string;
  color: string;
}

interface ForceGraphEdgeDatum {
  source: string;
  target: string;
  edge: SubGraphEdge;
  width: number;
  dash: number[] | null;
}

export function ForceGraphCanvas(props: ForceGraphCanvasProps): React.ReactElement {
  const { t } = useTranslation('food');
  const nodes = useMemo<ForceGraphNodeDatum[]>(
    () =>
      props.nodes.map((node) => ({
        ...node,
        label: nodeLabel(node),
        color: node.kind === 'variant' ? '#3b82f6' : '#9ca3af',
      })),
    [props.nodes]
  );
  const edges = useMemo<ForceGraphEdgeDatum[]>(
    () =>
      props.edges.map((edge) => ({
        source: edge.fromNodeId,
        target: edge.toNodeId,
        edge,
        width: edgeThicknessPx(edgeThickness(edge.ratio)),
        dash: edge.scope === 'recipe' ? [4, 4] : null,
      })),
    [props.edges]
  );
  const internal: ForceGraphInternalProps = {
    nodes,
    edges,
    width: props.width,
    height: props.height,
    onNodeClick: props.onNodeClick,
    onEdgeClick: props.onEdgeClick,
  };
  if (props.renderImpl) {
    return props.renderImpl(internal);
  }
  return (
    <div
      role="img"
      aria-label={t('data.substitutions.graph.canvasAria')}
      className="bg-muted/30 relative flex h-full w-full items-center justify-center overflow-hidden rounded-md"
    >
      <ForceGraphImpl {...internal} />
    </div>
  );
}

type FGNode = NodeObject<ForceGraphNodeDatum>;
type FGLink = LinkObject<ForceGraphNodeDatum, ForceGraphEdgeDatum>;

function ForceGraphImpl(props: ForceGraphInternalProps): React.ReactElement {
  // react-force-graph-2d augments the user types with simulation fields
  // (x/y/vx/vy) and possibly resolves `source`/`target` from strings to
  // node references after the first tick. We look up the click target
  // by id rather than trusting the augmented object's shape.
  const nodesById = new Map(props.nodes.map((n) => [n.id, n]));
  const edgesById = new Map(props.edges.map((l) => [l.edge.id, l]));
  return (
    <ForceGraph2D<ForceGraphNodeDatum, ForceGraphEdgeDatum>
      graphData={{
        nodes: props.nodes,
        links: props.edges,
      }}
      width={props.width}
      height={props.height}
      nodeId="id"
      nodeLabel="label"
      nodeColor={(n: FGNode) => n.color ?? '#9ca3af'}
      linkColor={() => '#94a3b8'}
      linkWidth={(l: FGLink) => l.width ?? 1}
      linkLineDash={(l: FGLink) => l.dash ?? null}
      linkDirectionalArrowLength={6}
      linkDirectionalArrowRelPos={1}
      onNodeClick={(n: FGNode) => {
        const id = typeof n.id === 'string' ? n.id : '';
        const match = nodesById.get(id);
        if (match) props.onNodeClick(match);
      }}
      onLinkClick={(l: FGLink) => {
        const id = l.edge?.id;
        const match = id !== undefined ? edgesById.get(id) : undefined;
        if (match) props.onEdgeClick(match.edge);
      }}
    />
  );
}
