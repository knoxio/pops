import { type RefObject, useCallback, useEffect, useRef } from 'react';

import {
  applyCanvasTransform,
  drawEdges,
  drawNodes,
  seedInternalNodes,
  simulateStep,
  type InternalNode,
} from './ForceGraph.utils';

import type { ForceEdge, ForceNode } from './ForceGraph';
import type { Transform } from './ForceGraph.pointer';

export type { Transform } from './ForceGraph.pointer';
export {
  type PointerHandlers,
  type PointerState,
  type UsePointerArgs,
  usePointerHandlers,
  usePointerRefs,
} from './ForceGraph.pointer';

export interface DrawArgs {
  edges: ForceEdge[];
  defaultNodeColor: string;
  edgeColor: string;
  labelColor: string;
}

export function useNodeMap(nodes: ForceNode[]): RefObject<Map<string, InternalNode>> {
  const nodesRef = useRef<Map<string, InternalNode>>(new Map());
  useEffect(() => {
    nodesRef.current = seedInternalNodes(nodesRef.current, nodes);
  }, [nodes]);
  return nodesRef;
}

export interface UseAnimationLoopArgs {
  nodesRef: RefObject<Map<string, InternalNode>>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hoverRef: RefObject<string | null>;
  transform: Transform;
  edges: ForceEdge[];
  iterationsPerFrame: number;
  drawArgs: Pick<DrawArgs, 'defaultNodeColor' | 'edgeColor' | 'labelColor'>;
}

export function useAnimationLoop({
  nodesRef,
  canvasRef,
  hoverRef,
  transform,
  edges,
  iterationsPerFrame,
  drawArgs,
}: UseAnimationLoopArgs) {
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height: h } = canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, h);
    applyCanvasTransform(ctx, canvas, transform);
    drawEdges(ctx, edges, nodesRef.current, drawArgs.edgeColor);
    drawNodes(ctx, nodesRef.current.values(), {
      defaultNodeColor: drawArgs.defaultNodeColor,
      labelColor: drawArgs.labelColor,
      hoveredId: hoverRef.current,
    });
  }, [canvasRef, hoverRef, nodesRef, edges, drawArgs, transform]);

  useEffect(() => {
    let raf: number | null = null;
    const loop = () => {
      for (let i = 0; i < iterationsPerFrame; i++) simulateStep(nodesRef.current, edges);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [draw, iterationsPerFrame, edges, nodesRef]);
}

export function useCanvasResize(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  wrapperRef: RefObject<HTMLDivElement | null>,
  height: number
) {
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
  }, [canvasRef, wrapperRef, height]);
}

export function useWheelZoom(
  wrapperRef: RefObject<HTMLDivElement | null>,
  enableZoom: boolean,
  setTransform: React.Dispatch<React.SetStateAction<Transform>>
) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !enableZoom) return;
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
  }, [wrapperRef, enableZoom, setTransform]);
}
