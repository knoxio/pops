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
import {
  applyCanvasTransform,
  drawEdges,
  drawNodes,
  pickNodeAtPoint,
  screenToWorld,
  seedInternalNodes,
  simulateStep,
  type InternalNode,
} from './ForceGraph.utils';

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
  const activePointerIdRef = useRef<number | null>(null);

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

  const clearInteraction = useCallback(() => {
    draggingRef.current = null;
    panningRef.current = null;
    activePointerIdRef.current = null;
  }, []);

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

  useEffect(() => {
    const onWindowBlur = () => {
      clearInteraction();
    };
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, [clearInteraction]);

  return (
    <div
      ref={wrapperRef}
      className={cn('relative w-full overflow-hidden rounded-md border border-border', className)}
      style={{ height }}
      onPointerMove={(e) => {
        if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current)
          return;
        if (activePointerIdRef.current !== null) {
          if (applyDrag(e.clientX, e.clientY)) return;
          if (applyPan(e.clientX, e.clientY)) return;
        }
        updateHoverFromPointer(e.clientX, e.clientY);
      }}
      onPointerLeave={clearHover}
      onPointerDown={(e) => {
        if (activePointerIdRef.current !== null) return;
        activePointerIdRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        beginPointerInteraction(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointerIdRef.current !== e.pointerId) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        activePointerIdRef.current = null;
        endPointerInteraction(e.clientX, e.clientY);
      }}
      onPointerCancel={(e) => {
        if (activePointerIdRef.current !== e.pointerId) return;
        clearInteraction();
      }}
      onLostPointerCapture={() => {
        clearInteraction();
      }}
    >
      <canvas ref={canvasRef} className="block" style={{ cursor: 'default' }} />
    </div>
  );
}
