/**
 * ConnectionGraph — force-directed graph visualization of connected items.
 *
 * Uses d3-force for layout physics and renders to HTML5 Canvas for performance.
 * Nodes are colored by item type. Click navigates to item detail. Zoom/pan supported.
 */
import { Skeleton } from '@pops/ui';
import { GRAPH_COLORS } from '@pops/ui/theme/graph-colors';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { trpc } from '../lib/trpc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode extends SimulationNodeDatum {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function getStructuralColors() {
  const s = getComputedStyle(document.documentElement);
  const mutedForeground = s.getPropertyValue('--color-muted-foreground').trim();
  return {
    edge: s.getPropertyValue('--color-border').trim() || GRAPH_COLORS.fallbacks.edge,
    currentBorder: GRAPH_COLORS.node.currentBorder,
    iconText: GRAPH_COLORS.node.iconText,
    label: mutedForeground || GRAPH_COLORS.fallbacks.label,
    legendText: mutedForeground || GRAPH_COLORS.fallbacks.legendText,
  };
}
const NODE_RADIUS = 24;
const LABEL_OFFSET = NODE_RADIUS + 10;

function getNodeColor(type: string | null): string {
  if (!type) return GRAPH_COLORS.node.default;
  return GRAPH_COLORS.types[type.toLowerCase()] ?? GRAPH_COLORS.node.default;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ConnectionGraphProps {
  itemId: string;
}

export function ConnectionGraph({ itemId }: ConnectionGraphProps): React.ReactElement {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    node: GraphNode | null;
    startX: number;
    startY: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    tx: number;
    ty: number;
  } | null>(null);
  const { data, isLoading, error } = trpc.inventory.connections.graph.useQuery(
    { itemId },
    { enabled: !!itemId }
  );

  const findNodeAt = useCallback((canvasX: number, canvasY: number): GraphNode | null => {
    const t = transformRef.current;
    const worldX = (canvasX - t.x) / t.k;
    const worldY = (canvasY - t.y) / t.k;

    // Search in reverse so top-drawn nodes are found first
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      if (!node) continue;
      const dx = (node.x ?? 0) - worldX;
      const dy = (node.y ?? 0) - worldY;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) {
        return node;
      }
    }
    return null;
  }, []);

  const draw = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const t = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Resolve structural colors once per frame (supports dark mode)
    const colors = getStructuralColors();

    // Draw edges
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1.5 / t.k;
    for (const link of linksRef.current) {
      const sx = link.source.x ?? 0;
      const sy = link.source.y ?? 0;
      const tx = link.target.x ?? 0;
      const ty = link.target.y ?? 0;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodesRef.current) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const isCurrent = node.id === itemId;
      const color = isCurrent ? GRAPH_COLORS.node.current : getNodeColor(node.type);

      // Circle
      ctx.beginPath();
      ctx.arc(nx, ny, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Border for current node
      if (isCurrent) {
        ctx.lineWidth = 3 / t.k;
        ctx.strokeStyle = colors.currentBorder;
        ctx.stroke();
      }

      // Icon text (first letter of type or item name)
      ctx.fillStyle = colors.iconText;
      ctx.font = `bold ${14 / t.k}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (node.type ?? node.itemName).charAt(0).toUpperCase();
      ctx.fillText(initial, nx, ny);

      // Label below
      ctx.fillStyle = colors.label;
      ctx.font = `${11 / t.k}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = node.itemName.length > 20 ? node.itemName.slice(0, 18) + '...' : node.itemName;
      ctx.fillText(label, nx, ny + LABEL_OFFSET / t.k);
    }

    ctx.restore();

    // Legend (fixed position, not affected by transform)
    const types = new Set(nodesRef.current.map((n) => n.type).filter(Boolean));
    if (types.size > 0) {
      ctx.save();
      ctx.scale(dpr, dpr);
      let ly = 12;
      ctx.font = '11px system-ui, sans-serif';
      for (const type of types) {
        if (!type) continue;
        const color = getNodeColor(type);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(16, ly + 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.legendText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(type, 26, ly + 5);
        ly += 18;
      }
      ctx.restore();
    }
  }, [itemId]);

  // Initialize simulation when data arrives
  useEffect(() => {
    if (!data?.data || !canvasRef.current || !containerRef.current) return;

    const { nodes: rawNodes, edges: rawEdges } = data.data;
    if (rawNodes.length === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Size canvas for retina
    const dpr = window.devicePixelRatio || 1;
    canvasRef.current.width = width * dpr;
    canvasRef.current.height = height * dpr;
    canvasRef.current.style.width = `${width}px`;
    canvasRef.current.style.height = `${height}px`;

    // Center transform
    transformRef.current = { x: width / 2, y: height / 2, k: 1 };

    // Build graph data
    const nodeMap = new Map<string, GraphNode>();
    const nodes: GraphNode[] = rawNodes.map((n) => {
      const gn: GraphNode = { ...n, x: 0, y: 0 };
      nodeMap.set(n.id, gn);
      return gn;
    });

    const links: GraphLink[] = rawEdges
      .map((e) => {
        const source = nodeMap.get(e.source);
        const target = nodeMap.get(e.target);
        if (!source || !target) return null;
        return { source, target };
      })
      .filter((l): l is GraphLink => l !== null);

    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(120)
      )
      .force('charge', forceManyBody().strength(-400))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(NODE_RADIUS + 8))
      .on('tick', () => {
        draw();
      });

    return (): void => {
      sim.stop();
    };
  }, [data, draw]);

  // Mouse handlers for pan, drag, click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleMouseDown(e: MouseEvent): void {
      const rect = canvas!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const node = findNodeAt(cx, cy);

      if (node) {
        dragRef.current = { node, startX: cx, startY: cy };
        node.fx = node.x;
        node.fy = node.y;
      } else {
        const t = transformRef.current;
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          tx: t.x,
          ty: t.y,
        };
      }
    }

    function handleMouseMove(e: MouseEvent): void {
      if (dragRef.current?.node) {
        const rect = canvas!.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const t = transformRef.current;
        dragRef.current.node.fx = (cx - t.x) / t.k;
        dragRef.current.node.fy = (cy - t.y) / t.k;
        draw();
      } else if (panRef.current) {
        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;
        transformRef.current.x = panRef.current.tx + dx;
        transformRef.current.y = panRef.current.ty + dy;
        draw();
      }
    }

    function handleMouseUp(e: MouseEvent): void {
      if (dragRef.current?.node) {
        const rect = canvas!.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const dx = cx - dragRef.current.startX;
        const dy = cy - dragRef.current.startY;
        const wasDrag = Math.abs(dx) > 3 || Math.abs(dy) > 3;

        // Release fixed position
        dragRef.current.node.fx = null;
        dragRef.current.node.fy = null;

        // Navigate on click (not drag)
        if (!wasDrag) {
          const node = dragRef.current.node;
          if (node.id !== itemId) {
            navigate(`/inventory/items/${node.id}`);
          }
        }

        dragRef.current = null;
      }
      panRef.current = null;
    }

    function handleWheel(e: WheelEvent): void {
      e.preventDefault();
      const t = transformRef.current;
      const rect = canvas!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newK = Math.min(Math.max(t.k * factor, 0.2), 5);

      // Zoom toward cursor
      t.x = cx - (cx - t.x) * (newK / t.k);
      t.y = cy - (cy - t.y) * (newK / t.k);
      t.k = newK;

      draw();
    }

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return (): void => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [draw, findNodeAt, itemId, navigate]);

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full rounded-lg" />;
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load connection graph.</p>;
  }

  if (!data?.data.nodes.length || data.data.nodes.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Not enough connections to display a graph.</p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[400px] w-full border rounded-lg bg-muted/20 overflow-hidden"
    >
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        Scroll to zoom, drag to pan, click node to navigate
      </div>
    </div>
  );
}
