import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { drawGraph, NODE_RADIUS } from './draw';

import type { GraphLink, GraphNode, Transform } from './types';

interface DragState {
  node: GraphNode | null;
  startX: number;
  startY: number;
}

interface PanState {
  startX: number;
  startY: number;
  tx: number;
  ty: number;
}

interface UseGraphInteractionArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodesRef: RefObject<GraphNode[]>;
  linksRef: RefObject<GraphLink[]>;
  transformRef: RefObject<Transform>;
  itemId: string;
  onNavigate: (id: string) => void;
}

function findNodeAt(
  nodes: GraphNode[],
  transform: Transform,
  canvasX: number,
  canvasY: number
): GraphNode | null {
  const worldX = (canvasX - transform.x) / transform.k;
  const worldY = (canvasY - transform.y) / transform.k;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!node) continue;
    const dx = (node.x ?? 0) - worldX;
    const dy = (node.y ?? 0) - worldY;
    if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) return node;
  }
  return null;
}

function applyZoom(t: Transform, deltaY: number, cx: number, cy: number): void {
  const factor = deltaY < 0 ? 1.1 : 0.9;
  const newK = Math.min(Math.max(t.k * factor, 0.2), 5);
  t.x = cx - (cx - t.x) * (newK / t.k);
  t.y = cy - (cy - t.y) * (newK / t.k);
  t.k = newK;
}

interface HandlerCtx {
  canvas: HTMLCanvasElement;
  nodesRef: RefObject<GraphNode[]>;
  transformRef: RefObject<Transform>;
  dragRef: RefObject<DragState | null>;
  panRef: RefObject<PanState | null>;
  itemId: string;
  onNavigate: (id: string) => void;
  draw: () => void;
}

function makeMouseDown(ctx: HandlerCtx) {
  return (e: MouseEvent): void => {
    const rect = ctx.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const node = findNodeAt(ctx.nodesRef.current ?? [], ctx.transformRef.current, cx, cy);
    if (node) {
      ctx.dragRef.current = { node, startX: cx, startY: cy };
      node.fx = node.x;
      node.fy = node.y;
      return;
    }
    const t = ctx.transformRef.current;
    ctx.panRef.current = { startX: e.clientX, startY: e.clientY, tx: t.x, ty: t.y };
  };
}

function makeMouseMove(ctx: HandlerCtx) {
  return (e: MouseEvent): void => {
    if (ctx.dragRef.current?.node) {
      const rect = ctx.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const t = ctx.transformRef.current;
      ctx.dragRef.current.node.fx = (cx - t.x) / t.k;
      ctx.dragRef.current.node.fy = (cy - t.y) / t.k;
      ctx.draw();
      return;
    }
    if (ctx.panRef.current) {
      const dx = e.clientX - ctx.panRef.current.startX;
      const dy = e.clientY - ctx.panRef.current.startY;
      ctx.transformRef.current.x = ctx.panRef.current.tx + dx;
      ctx.transformRef.current.y = ctx.panRef.current.ty + dy;
      ctx.draw();
    }
  };
}

function makeMouseUp(ctx: HandlerCtx) {
  return (e: MouseEvent): void => {
    if (ctx.dragRef.current?.node) {
      const rect = ctx.canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - ctx.dragRef.current.startX;
      const dy = e.clientY - rect.top - ctx.dragRef.current.startY;
      const wasDrag = Math.abs(dx) > 3 || Math.abs(dy) > 3;
      ctx.dragRef.current.node.fx = null;
      ctx.dragRef.current.node.fy = null;
      if (!wasDrag && ctx.dragRef.current.node.id !== ctx.itemId) {
        ctx.onNavigate(ctx.dragRef.current.node.id);
      }
      ctx.dragRef.current = null;
    }
    ctx.panRef.current = null;
  };
}

function makeWheel(ctx: HandlerCtx) {
  return (e: WheelEvent): void => {
    e.preventDefault();
    const rect = ctx.canvas.getBoundingClientRect();
    applyZoom(ctx.transformRef.current, e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    ctx.draw();
  };
}

export function useGraphInteraction(args: UseGraphInteractionArgs): void {
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const { canvasRef, nodesRef, linksRef, transformRef, itemId, onNavigate } = args;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawGraph({
      canvas,
      nodes: nodesRef.current ?? [],
      links: linksRef.current ?? [],
      transform: transformRef.current ?? { x: 0, y: 0, k: 1 },
      itemId,
    });
  }, [canvasRef, nodesRef, linksRef, transformRef, itemId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx: HandlerCtx = {
      canvas,
      nodesRef,
      transformRef,
      dragRef,
      panRef,
      itemId,
      onNavigate,
      draw,
    };
    const onDown = makeMouseDown(ctx);
    const onMove = makeMouseMove(ctx);
    const onUp = makeMouseUp(ctx);
    const onWheel = makeWheel(ctx);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [canvasRef, nodesRef, transformRef, itemId, onNavigate, draw]);
}
