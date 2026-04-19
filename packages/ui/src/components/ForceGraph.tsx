/**
 * ForceGraph — Canvas-based force-directed graph primitive.
 *
 * Self-contained, framework-agnostic physics (a small Verlet-ish simulation
 * with spring edges, charge repulsion, and centring). Consumers provide
 * node/edge data, optional colour maps, and click/hover handlers. No
 * external d3 dependency is required so this works anywhere in the
 * workspace.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';

export interface ForceNode {
  id: string;
  /** Optional initial position. Randomised if absent. */
  x?: number;
  y?: number;
  /** Optional display label. */
  label?: string;
  /** Fill colour. Defaults to the `defaultNodeColor` prop. */
  color?: string;
  /** Radius in CSS pixels. Default 8. */
  radius?: number;
}

export interface ForceEdge {
  source: string;
  target: string;
  /** Target edge length for the spring. */
  length?: number;
}

export interface ForceGraphProps {
  nodes: ForceNode[];
  edges: ForceEdge[];
  /** Fallback colour when a node has no `color`. */
  defaultNodeColor?: string;
  /** Edge stroke colour. Uses CSS currentColor fallback if omitted. */
  edgeColor?: string;
  /** Label text colour. */
  labelColor?: string;
  /** Called when a node is clicked. */
  onNodeClick?: (id: string) => void;
  /** Called when hover changes (null = left canvas). */
  onNodeHover?: (id: string | null) => void;
  /** Simulation iterations per animation frame. Default 1. */
  iterationsPerFrame?: number;
  /** Enable zoom/pan. Default true. */
  enableZoom?: boolean;
  className?: string;
  /** Height in CSS pixels. Width is filled from the parent. */
  height?: number;
}

interface InternalNode extends ForceNode {
  vx: number;
  vy: number;
  fx: number;
  fy: number;
}

const DEFAULT_EDGE_LENGTH = 80;
const SPRING = 0.02;
const CHARGE = 3000;
const DAMPING = 0.85;
const CENTRE_PULL = 0.002;

function seedInternalNodes(
  prev: Map<string, InternalNode>,
  nodes: ForceNode[]
): Map<string, InternalNode> {
  const next = new Map<string, InternalNode>();
  for (const n of nodes) {
    const prevNode = prev.get(n.id);
    next.set(n.id, {
      ...n,
      x: prevNode?.x ?? n.x ?? (Math.random() - 0.5) * 200,
      y: prevNode?.y ?? n.y ?? (Math.random() - 0.5) * 200,
      vx: prevNode?.vx ?? 0,
      vy: prevNode?.vy ?? 0,
      fx: 0,
      fy: 0,
    });
  }
  return next;
}

function simulateStep(nodes: Map<string, InternalNode>, edges: ForceEdge[]) {
  const list = Array.from(nodes.values());

  for (const n of list) {
    n.fx = 0;
    n.fy = 0;
  }

  // Repulsion.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const dx = (a.x ?? 0) - (b.x ?? 0);
      const dy = (a.y ?? 0) - (b.y ?? 0);
      const dist2 = Math.max(dx * dx + dy * dy, 25);
      const f = CHARGE / dist2;
      const dist = Math.sqrt(dist2);
      const nx = dx / dist;
      const ny = dy / dist;
      a.fx += nx * f;
      a.fy += ny * f;
      b.fx -= nx * f;
      b.fy -= ny * f;
    }
  }

  // Springs.
  for (const e of edges) {
    const a = nodes.get(e.source);
    const b = nodes.get(e.target);
    if (!a || !b) continue;
    const dx = (b.x ?? 0) - (a.x ?? 0);
    const dy = (b.y ?? 0) - (a.y ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const target = e.length ?? DEFAULT_EDGE_LENGTH;
    const f = (dist - target) * SPRING;
    const nx = dx / dist;
    const ny = dy / dist;
    a.fx += nx * f;
    a.fy += ny * f;
    b.fx -= nx * f;
    b.fy -= ny * f;
  }

  // Integration.
  for (const n of list) {
    n.fx += -(n.x ?? 0) * CENTRE_PULL;
    n.fy += -(n.y ?? 0) * CENTRE_PULL;
    n.vx = (n.vx + n.fx) * DAMPING;
    n.vy = (n.vy + n.fy) * DAMPING;
    n.x = (n.x ?? 0) + n.vx;
    n.y = (n.y ?? 0) + n.vy;
  }
}

function applyCanvasTransform(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  transform: { x: number; y: number; k: number }
) {
  const { width, height } = canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(
    dpr * transform.k,
    0,
    0,
    dpr * transform.k,
    dpr * (width / 2 / dpr + transform.x),
    dpr * (height / 2 / dpr + transform.y)
  );
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: ForceEdge[],
  nodes: Map<string, InternalNode>,
  edgeColor: string
) {
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = 1;
  for (const e of edges) {
    const a = nodes.get(e.source);
    const b = nodes.get(e.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x ?? 0, a.y ?? 0);
    ctx.lineTo(b.x ?? 0, b.y ?? 0);
    ctx.stroke();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: Iterable<InternalNode>,
  opts: { defaultNodeColor: string; labelColor: string; hoveredId: string | null }
) {
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const n of nodes) {
    const r = n.radius ?? 8;
    ctx.fillStyle = n.color ?? opts.defaultNodeColor;
    ctx.beginPath();
    ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
    ctx.fill();

    if (opts.hoveredId === n.id) {
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (n.label) {
      ctx.fillStyle = opts.labelColor;
      ctx.fillText(n.label, n.x ?? 0, (n.y ?? 0) + r + 10);
    }
  }
}

function screenToWorld(
  canvasRect: DOMRect,
  transform: { x: number; y: number; k: number },
  clientX: number,
  clientY: number
) {
  const cx = clientX - canvasRect.left - canvasRect.width / 2 - transform.x;
  const cy = clientY - canvasRect.top - canvasRect.height / 2 - transform.y;
  return { x: cx / transform.k, y: cy / transform.k };
}

function pickNodeAtPoint(nodes: Iterable<InternalNode>, x: number, y: number): InternalNode | null {
  for (const n of nodes) {
    const r = n.radius ?? 8;
    const dx = (n.x ?? 0) - x;
    const dy = (n.y ?? 0) - y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

export function ForceGraph({
  nodes,
  edges,
  defaultNodeColor = '#64748b',
  edgeColor = '#cbd5e1',
  labelColor = '#334155',
  onNodeClick,
  onNodeHover,
  iterationsPerFrame = 1,
  enableZoom = true,
  className,
  height = 480,
}: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<Map<string, InternalNode>>(new Map());
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  const draggingRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panningRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Seed or update internal node state when inputs change.
  useEffect(() => {
    nodesRef.current = seedInternalNodes(nodesRef.current, nodes);
  }, [nodes]);

  const step = useCallback(() => {
    simulateStep(nodesRef.current, edges);
  }, [edges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height: h } = canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, h);

    applyCanvasTransform(ctx, canvas, transform);
    drawEdges(ctx, edges, nodesRef.current, edgeColor);
    drawNodes(ctx, nodesRef.current.values(), {
      defaultNodeColor,
      labelColor,
      hoveredId: hoverRef.current,
    });
  }, [edges, defaultNodeColor, edgeColor, labelColor, transform]);

  useEffect(() => {
    const loop = () => {
      for (let i = 0; i < iterationsPerFrame; i++) step();
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [step, draw, iterationsPerFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrapper.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !enableZoom) return;
    // Native non-passive wheel listener so preventDefault stops page scroll.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setTransform((t) => ({
        ...t,
        k: Math.min(4, Math.max(0.25, t.k * (1 + delta))),
      }));
    };
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', onWheel);
  }, [enableZoom]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return screenToWorld(rect, transform, clientX, clientY);
    },
    [transform]
  );

  const pickNode = useCallback(
    (clientX: number, clientY: number): InternalNode | null => {
      const { x, y } = toWorld(clientX, clientY);
      return pickNodeAtPoint(nodesRef.current.values(), x, y);
    },
    [toWorld]
  );

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = draggingRef.current;
      if (!drag) return false;
      const { x, y } = toWorld(clientX, clientY);
      const node = nodesRef.current.get(drag.id);
      if (node) {
        node.x = x - drag.dx;
        node.y = y - drag.dy;
        node.vx = 0;
        node.vy = 0;
      }
      return true;
    },
    [toWorld]
  );

  const applyPan = useCallback(
    (clientX: number, clientY: number) => {
      const pan = panningRef.current;
      if (!pan || !enableZoom) return false;
      setTransform((t) => ({
        ...t,
        x: pan.ox + (clientX - pan.sx),
        y: pan.oy + (clientY - pan.sy),
      }));
      return true;
    },
    [enableZoom]
  );

  const updateHoverFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const hit = pickNode(clientX, clientY);
      const nextId = hit?.id ?? null;
      if (nextId === hoverRef.current) return;
      hoverRef.current = nextId;
      onNodeHover?.(nextId);
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = nextId ? 'pointer' : 'default';
    },
    [onNodeHover, pickNode]
  );

  const clearHover = useCallback(() => {
    hoverRef.current = null;
    onNodeHover?.(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
  }, [onNodeHover]);

  const beginPointerInteraction = useCallback(
    (clientX: number, clientY: number) => {
      const hit = pickNode(clientX, clientY);
      if (hit) {
        const { x, y } = toWorld(clientX, clientY);
        draggingRef.current = {
          id: hit.id,
          dx: x - (hit.x ?? 0),
          dy: y - (hit.y ?? 0),
        };
        return;
      }
      if (!enableZoom) return;
      panningRef.current = {
        sx: clientX,
        sy: clientY,
        ox: transform.x,
        oy: transform.y,
      };
    },
    [enableZoom, pickNode, toWorld, transform.x, transform.y]
  );

  const endPointerInteraction = useCallback(
    (clientX: number, clientY: number) => {
      if (draggingRef.current) {
        draggingRef.current = null;
        return;
      }
      panningRef.current = null;
      const hit = pickNode(clientX, clientY);
      if (hit && onNodeClick) onNodeClick(hit.id);
    },
    [onNodeClick, pickNode]
  );

  return (
    <div
      ref={wrapperRef}
      className={cn('relative w-full overflow-hidden rounded-md border border-border', className)}
      style={{ height }}
      onMouseMove={(e) => {
        if (applyDrag(e.clientX, e.clientY)) return;
        if (applyPan(e.clientX, e.clientY)) return;
        updateHoverFromPointer(e.clientX, e.clientY);
      }}
      onMouseLeave={clearHover}
      onMouseDown={(e) => {
        beginPointerInteraction(e.clientX, e.clientY);
      }}
      onMouseUp={(e) => {
        endPointerInteraction(e.clientX, e.clientY);
      }}
    >
      <canvas ref={canvasRef} className="block" style={{ cursor: 'default' }} />
    </div>
  );
}
