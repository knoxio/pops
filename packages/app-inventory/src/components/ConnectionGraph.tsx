import { useRef } from 'react';
import { useNavigate } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Skeleton } from '@pops/ui';

import { useGraphInteraction } from './connection-graph/useGraphInteraction';
import { useGraphSimulation } from './connection-graph/useGraphSimulation';

import type { GraphLink, GraphNode, Transform } from './connection-graph/types';

interface GraphResult {
  data: {
    nodes: Array<{ id: string; itemName: string; assetId: string | null; type: string | null }>;
    edges: Array<{ source: string; target: string }>;
  };
}

export interface ConnectionGraphProps {
  itemId: string;
}

function GraphCanvas({ itemId }: { itemId: string }): React.ReactElement {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });

  const { data } = usePillarQuery<GraphResult>(
    'inventory',
    ['connections', 'graph'],
    { itemId },
    { enabled: !!itemId }
  );

  useGraphSimulation({
    rawData: data?.data ?? null,
    canvasRef,
    containerRef,
    itemId,
    nodesRef,
    linksRef,
    transformRef,
  });
  useGraphInteraction({
    canvasRef,
    nodesRef,
    linksRef,
    transformRef,
    itemId,
    onNavigate: (id) => navigate(`/inventory/items/${id}`),
  });

  return (
    <div
      ref={containerRef}
      className="relative h-100 w-full border rounded-lg bg-muted/20 overflow-hidden"
    >
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        Scroll to zoom, drag to pan, click node to navigate
      </div>
    </div>
  );
}

export function ConnectionGraph({ itemId }: ConnectionGraphProps): React.ReactElement {
  const { data, isLoading, error, isUnavailable, isContractMismatch } = usePillarQuery<GraphResult>(
    'inventory',
    ['connections', 'graph'],
    { itemId },
    { enabled: !!itemId }
  );

  if (isLoading) return <Skeleton className="h-100 w-full rounded-lg" />;
  if (isUnavailable || isContractMismatch) {
    return <p className="text-sm text-muted-foreground">Connection graph unavailable.</p>;
  }
  if (error) return <p className="text-sm text-destructive">Failed to load connection graph.</p>;
  if (!data?.data.nodes.length || data.data.nodes.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Not enough connections to display a graph.</p>
    );
  }

  return <GraphCanvas itemId={itemId} />;
}
