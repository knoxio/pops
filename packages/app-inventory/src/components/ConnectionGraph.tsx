import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useNavigate } from 'react-router';

import { Skeleton } from '@pops/ui';

import { isUnavailableError, unwrap } from '../inventory-api-helpers.js';
import { connectionsGraph } from '../inventory-api/index.js';
import { useGraphInteraction } from './connection-graph/useGraphInteraction';
import { useGraphSimulation } from './connection-graph/useGraphSimulation';

import type { GraphLink, GraphNode, Transform } from './connection-graph/types';

export interface ConnectionGraphProps {
  itemId: string;
}

const MAX_GRAPH_DEPTH = 10;

function useConnectionGraphQuery(itemId: string) {
  return useQuery({
    queryKey: ['inventory', 'connections', 'graph', itemId],
    queryFn: async () =>
      unwrap(await connectionsGraph({ path: { itemId }, query: { maxDepth: MAX_GRAPH_DEPTH } })),
    enabled: !!itemId,
  });
}

function GraphCanvas({ itemId }: { itemId: string }): React.ReactElement {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });

  const { data } = useConnectionGraphQuery(itemId);

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
  const { data, isLoading, error } = useConnectionGraphQuery(itemId);

  if (isLoading) return <Skeleton className="h-100 w-full rounded-lg" />;
  if (isUnavailableError(error)) {
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
