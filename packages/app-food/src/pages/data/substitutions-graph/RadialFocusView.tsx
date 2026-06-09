/**
 * Radial-by-node layout used when the URL includes `?node=<slug>`.
 *
 * Centre node is the focused entity; outgoing edges fan to the right,
 * incoming edges fan in from the left. Edges are sorted radially by how
 * close the ratio is to 1.0 (PRD-148 spec). Pure SVG layout — keeps the
 * focused view light + screenshot-friendly without spinning up the
 * force-directed canvas.
 */
import { useTranslation } from 'react-i18next';

import { edgeThickness, edgeThicknessPx, nodeLabel, partitionEdgesAroundNode } from './helpers';

import type { SubGraphEdge, SubGraphNode } from './types';

export interface RadialFocusViewProps {
  focus: SubGraphNode;
  nodes: readonly SubGraphNode[];
  edges: readonly SubGraphEdge[];
  onNodeClick: (node: SubGraphNode) => void;
  onEdgeClick: (edge: SubGraphEdge) => void;
}

const CANVAS_W = 720;
const CANVAS_H = 480;
const CENTRE_X = CANVAS_W / 2;
const CENTRE_Y = CANVAS_H / 2;
const RADIUS = 180;

export function RadialFocusView(props: RadialFocusViewProps): React.ReactElement {
  const { t } = useTranslation('food');
  const { incoming, outgoing } = partitionEdgesAroundNode(props.edges, props.focus);
  const nodesById = new Map(props.nodes.map((n) => [n.id, n]));
  const sortedIncoming = [...incoming].toSorted((a, b) => ratioDistance(a) - ratioDistance(b));
  const sortedOutgoing = [...outgoing].toSorted((a, b) => ratioDistance(a) - ratioDistance(b));
  const focusLabel = nodeLabel(props.focus);
  return (
    <svg
      role="img"
      aria-label={t('data.substitutions.graph.viewMode.radial', { label: focusLabel })}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="bg-muted/30 h-full w-full rounded-md"
    >
      <RadialSide
        edges={sortedOutgoing}
        side="right"
        nodesById={nodesById}
        onNodeClick={props.onNodeClick}
        onEdgeClick={props.onEdgeClick}
      />
      <RadialSide
        edges={sortedIncoming}
        side="left"
        nodesById={nodesById}
        onNodeClick={props.onNodeClick}
        onEdgeClick={props.onEdgeClick}
      />
      <g>
        <circle cx={CENTRE_X} cy={CENTRE_Y} r={28} fill="#1f2937" />
        <text
          x={CENTRE_X}
          y={CENTRE_Y + 4}
          textAnchor="middle"
          fontSize="13"
          fill="white"
          fontWeight="600"
        >
          {focusLabel}
        </text>
      </g>
    </svg>
  );
}

function ratioDistance(edge: SubGraphEdge): number {
  if (!Number.isFinite(edge.ratio)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(edge.ratio - 1);
}

interface RadialSideProps {
  edges: SubGraphEdge[];
  side: 'left' | 'right';
  nodesById: Map<string, SubGraphNode>;
  onNodeClick: (node: SubGraphNode) => void;
  onEdgeClick: (edge: SubGraphEdge) => void;
}

function RadialSide(props: RadialSideProps): React.ReactElement {
  if (props.edges.length === 0) return <g />;
  const sign = props.side === 'right' ? 1 : -1;
  const slice = Math.PI / Math.max(props.edges.length + 1, 2);
  return (
    <g>
      {props.edges.map((edge, idx) => {
        const angle = -Math.PI / 2 + slice * (idx + 1);
        const x = CENTRE_X + sign * RADIUS * Math.sin(angle + Math.PI / 2);
        const y = CENTRE_Y - RADIUS * Math.cos(angle + Math.PI / 2);
        const otherId = props.side === 'right' ? edge.toNodeId : edge.fromNodeId;
        const other = props.nodesById.get(otherId);
        return (
          <RadialSpoke
            key={edge.id}
            edge={edge}
            other={other}
            x={x}
            y={y}
            onNodeClick={props.onNodeClick}
            onEdgeClick={props.onEdgeClick}
          />
        );
      })}
    </g>
  );
}

interface RadialSpokeProps {
  edge: SubGraphEdge;
  other: SubGraphNode | undefined;
  x: number;
  y: number;
  onNodeClick: (node: SubGraphNode) => void;
  onEdgeClick: (edge: SubGraphEdge) => void;
}

function RadialSpoke(props: RadialSpokeProps): React.ReactElement {
  const strokeWidth = edgeThicknessPx(edgeThickness(props.edge.ratio));
  const dasharray = props.edge.scope === 'recipe' ? '4 4' : undefined;
  return (
    <g>
      <line
        x1={CENTRE_X}
        y1={CENTRE_Y}
        x2={props.x}
        y2={props.y}
        stroke="#64748b"
        strokeWidth={strokeWidth}
        strokeDasharray={dasharray}
        onClick={() => props.onEdgeClick(props.edge)}
        style={{ cursor: 'pointer' }}
      />
      {props.other !== undefined && (
        <RadialOtherNode
          node={props.other}
          x={props.x}
          y={props.y}
          onNodeClick={props.onNodeClick}
        />
      )}
    </g>
  );
}

function RadialOtherNode({
  node,
  x,
  y,
  onNodeClick,
}: {
  node: SubGraphNode;
  x: number;
  y: number;
  onNodeClick: (node: SubGraphNode) => void;
}): React.ReactElement {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onNodeClick(node)}
      style={{ cursor: 'pointer' }}
    >
      <circle r={20} fill={node.kind === 'variant' ? '#3b82f6' : '#9ca3af'} />
      <text textAnchor="middle" fontSize="11" y={4} fill="white" fontWeight="500">
        {truncate(nodeLabel(node))}
      </text>
    </g>
  );
}

function truncate(s: string): string {
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}
