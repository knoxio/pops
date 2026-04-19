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
    const next = new Map<string, InternalNode>();
    for (const n of nodes) {
      const prev = nodesRef.current.get(n.id);
      next.set(n.id, {
        ...n,
        x: prev?.x ?? n.x ?? (Math.random() - 0.5) * 200,
        y: prev?.y ?? n.y ?? (Math.random() - 0.5) * 200,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        fx: 0,
        fy: 0,
      });
    }
    nodesRef.current = next;
  }, [nodes]);

  const step = useCallback(() => {
    const map = nodesRef.current;
    const list = Array.from(map.values());
    for (const n of list) {
      n.fx = 0;
      n.fy = 0;
    }
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
    for (const e of edges) {
      const a = map.get(e.source);
      const b = map.get(e.target);
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
    for (const n of list) {
      n.fx += -(n.x ?? 0) * CENTRE_PULL;
      n.fy += -(n.y ?? 0) * CENTRE_PULL;
      n.vx = (n.vx + n.fx) * DAMPING;
      n.vy = (n.vy + n.fy) * DAMPING;
      n.x = (n.x ?? 0) + n.vx;
      n.y = (n.y ?? 0) + n.vy;
    }
  }, [edges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height: h } = canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, h);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(
      dpr * transform.k,
      0,
      0,
      dpr * transform.k,
      dpr * (width / 2 / dpr + transform.x),
      dpr * (h / 2 / dpr + transform.y)
    );

    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = nodesRef.current.get(e.source);
      const b = nodesRef.current.get(e.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x ?? 0, a.y ?? 0);
      ctx.lineTo(b.x ?? 0, b.y ?? 0);
      ctx.stroke();
    }

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of nodesRef.current.values()) {
      const r = n.radius ?? 8;
      ctx.fillStyle = n.color ?? defaultNodeColor;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
      ctx.fill();
      if (hoverRef.current === n.id) {
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (n.label) {
        ctx.fillStyle = labelColor;
        ctx.fillText(n.label, n.x ?? 0, (n.y ?? 0) + r + 10);
      }
    }
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

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2 - transform.x;
    const cy = clientY - rect.top - rect.height / 2 - transform.y;
    return { x: cx / transform.k, y: cy / transform.k };
  };

  const pickNode = (clientX: number, clientY: number): InternalNode | null => {
    const { x, y } = toWorld(clientX, clientY);
    for (const n of nodesRef.current.values()) {
      const r = n.radius ?? 8;
      const dx = (n.x ?? 0) - x;
      const dy = (n.y ?? 0) - y;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('relative w-full overflow-hidden rounded-md border border-border', className)}
      style={{ height }}
      onMouseMove={(e) => {
        if (draggingRef.current) {
          const { x, y } = toWorld(e.clientX, e.clientY);
          const node = nodesRef.current.get(draggingRef.current.id);
          if (node) {
            node.x = x - draggingRef.current.dx;
            node.y = y - draggingRef.current.dy;
            node.vx = 0;
            node.vy = 0;
          }
          return;
        }
        if (panningRef.current && enableZoom) {
          setTransform((t) => ({
            ...t,
            x: panningRef.current!.ox + (e.clientX - panningRef.current!.sx),
            y: panningRef.current!.oy + (e.clientY - panningRef.current!.sy),
          }));
          return;
        }
        const hit = pickNode(e.clientX, e.clientY);
        const nextId = hit?.id ?? null;
        if (nextId !== hoverRef.current) {
          hoverRef.current = nextId;
          onNodeHover?.(nextId);
        }
      }}
      onMouseLeave={() => {
        hoverRef.current = null;
        onNodeHover?.(null);
      }}
      onMouseDown={(e) => {
        const hit = pickNode(e.clientX, e.clientY);
        if (hit) {
          const { x, y } = toWorld(e.clientX, e.clientY);
          draggingRef.current = {
            id: hit.id,
            dx: x - (hit.x ?? 0),
            dy: y - (hit.y ?? 0),
          };
        } else if (enableZoom) {
          panningRef.current = {
            sx: e.clientX,
            sy: e.clientY,
            ox: transform.x,
            oy: transform.y,
          };
        }
      }}
      onMouseUp={(e) => {
        if (draggingRef.current) {
          draggingRef.current = null;
          return;
        }
        panningRef.current = null;
        const hit = pickNode(e.clientX, e.clientY);
        if (hit && onNodeClick) onNodeClick(hit.id);
      }}
      onWheel={(e) => {
        if (!enableZoom) return;
        const delta = -e.deltaY * 0.001;
        setTransform((t) => ({
          ...t,
          k: Math.min(4, Math.max(0.25, t.k * (1 + delta))),
        }));
      }}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor: hoverRef.current ? 'pointer' : 'default' }}
      />
    </div>
  );
}
