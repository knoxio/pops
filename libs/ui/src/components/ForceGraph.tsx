/**
 * ForceGraph — Canvas-based force-directed graph primitive.
 *
 * Self-contained, framework-agnostic physics (a small Verlet-ish simulation
 * with spring edges, charge repulsion, and centring). Consumers provide
 * node/edge data, optional colour maps, and click/hover handlers. No
 * external d3 dependency is required so this works anywhere in the
 * workspace.
 */
import { useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import {
  type PointerHandlers,
  useAnimationLoop,
  useCanvasResize,
  useNodeMap,
  usePointerHandlers,
  usePointerRefs,
  useWheelZoom,
} from './ForceGraph.hooks';

export interface ForceNode {
  id: string;
  x?: number;
  y?: number;
  label?: string;
  color?: string;
  radius?: number;
}

export interface ForceEdge {
  source: string;
  target: string;
  length?: number;
}

export interface ForceGraphProps {
  nodes: ForceNode[];
  edges: ForceEdge[];
  defaultNodeColor?: string;
  edgeColor?: string;
  labelColor?: string;
  onNodeClick?: (id: string) => void;
  onNodeHover?: (id: string | null) => void;
  iterationsPerFrame?: number;
  enableZoom?: boolean;
  className?: string;
  height?: number;
}

interface PointerOverlayProps {
  handlers: PointerHandlers;
  activePointerIdRef: React.RefObject<number | null>;
}

function pointerHandlerProps({ handlers, activePointerIdRef }: PointerOverlayProps) {
  return {
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      if (activePointerIdRef.current !== null) {
        if (handlers.applyDrag(e.clientX, e.clientY)) return;
        if (handlers.applyPan(e.clientX, e.clientY)) return;
      }
      handlers.updateHoverFromPointer(e.clientX, e.clientY);
    },
    onPointerLeave: handlers.clearHover,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== null) return;
      activePointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      handlers.beginPointerInteraction(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      activePointerIdRef.current = null;
      handlers.endPointerInteraction(e.clientX, e.clientY);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      handlers.clearInteraction();
    },
    onLostPointerCapture: handlers.clearInteraction,
  };
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
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const nodesRef = useNodeMap(nodes);
  const pointerRefs = usePointerRefs();

  useAnimationLoop({
    nodesRef,
    canvasRef,
    hoverRef: pointerRefs.hoverRef,
    transform,
    edges,
    iterationsPerFrame,
    drawArgs: { defaultNodeColor, edgeColor, labelColor },
  });
  useCanvasResize(canvasRef, wrapperRef, height);
  useWheelZoom(wrapperRef, enableZoom, setTransform);

  const handlers = usePointerHandlers({
    canvasRef,
    nodesRef,
    state: pointerRefs,
    transform,
    setTransform,
    enableZoom,
    onNodeHover,
    onNodeClick,
  });

  useEffect(() => {
    const onWindowBlur = () => handlers.clearInteraction();
    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, [handlers]);

  return (
    <div
      ref={wrapperRef}
      className={cn('relative w-full overflow-hidden rounded-md border border-border', className)}
      style={{ height }}
      {...pointerHandlerProps({ handlers, activePointerIdRef: pointerRefs.activePointerIdRef })}
    >
      <canvas ref={canvasRef} className="block" style={{ cursor: 'default' }} />
    </div>
  );
}
