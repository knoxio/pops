import { type RefObject, useCallback, useRef } from 'react';

import { pickNodeAtPoint, screenToWorld, type InternalNode } from './ForceGraph.utils';

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface PointerState {
  hoverRef: RefObject<string | null>;
  draggingRef: RefObject<{ id: string; dx: number; dy: number } | null>;
  panningRef: RefObject<{ sx: number; sy: number; ox: number; oy: number } | null>;
  activePointerIdRef: RefObject<number | null>;
}

export function usePointerRefs(): PointerState {
  return {
    hoverRef: useRef<string | null>(null),
    draggingRef: useRef<{ id: string; dx: number; dy: number } | null>(null),
    panningRef: useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null),
    activePointerIdRef: useRef<number | null>(null),
  };
}

export interface UsePointerArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodesRef: RefObject<Map<string, InternalNode>>;
  state: PointerState;
  transform: Transform;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
  enableZoom: boolean;
  onNodeHover?: (id: string | null) => void;
  onNodeClick?: (id: string) => void;
}

export interface PointerHandlers {
  toWorld: (x: number, y: number) => { x: number; y: number };
  pickNode: (x: number, y: number) => InternalNode | null;
  applyDrag: (x: number, y: number) => boolean;
  applyPan: (x: number, y: number) => boolean;
  updateHoverFromPointer: (x: number, y: number) => void;
  clearHover: () => void;
  clearInteraction: () => void;
  beginPointerInteraction: (x: number, y: number) => void;
  endPointerInteraction: (x: number, y: number) => void;
}

function useToWorld(canvasRef: RefObject<HTMLCanvasElement | null>, transform: Transform) {
  return useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return screenToWorld(rect, transform, clientX, clientY);
    },
    [canvasRef, transform]
  );
}

function usePickNode(
  nodesRef: RefObject<Map<string, InternalNode>>,
  toWorld: (x: number, y: number) => { x: number; y: number }
) {
  return useCallback(
    (cx: number, cy: number): InternalNode | null => {
      const { x, y } = toWorld(cx, cy);
      return pickNodeAtPoint(nodesRef.current.values(), x, y);
    },
    [nodesRef, toWorld]
  );
}

function useDragApply(args: UsePointerArgs, toWorld: ReturnType<typeof useToWorld>) {
  return useCallback(
    (cx: number, cy: number) => {
      const drag = args.state.draggingRef.current;
      if (!drag) return false;
      const { x, y } = toWorld(cx, cy);
      const node = args.nodesRef.current.get(drag.id);
      if (node) {
        node.x = x - drag.dx;
        node.y = y - drag.dy;
        node.vx = 0;
        node.vy = 0;
      }
      return true;
    },
    [args.state.draggingRef, args.nodesRef, toWorld]
  );
}

function usePanApply(args: UsePointerArgs) {
  return useCallback(
    (cx: number, cy: number) => {
      const pan = args.state.panningRef.current;
      if (!pan || !args.enableZoom) return false;
      args.setTransform((t) => ({ ...t, x: pan.ox + (cx - pan.sx), y: pan.oy + (cy - pan.sy) }));
      return true;
    },
    [args.state.panningRef, args.enableZoom, args.setTransform]
  );
}

function useHoverHandlers(
  args: UsePointerArgs,
  pickNode: (x: number, y: number) => InternalNode | null
) {
  const setCursor = (style: 'pointer' | 'default') => {
    const canvas = args.canvasRef.current;
    if (canvas) canvas.style.cursor = style;
  };
  const updateHoverFromPointer = useCallback(
    (cx: number, cy: number) => {
      const hit = pickNode(cx, cy);
      const nextId = hit?.id ?? null;
      if (nextId === args.state.hoverRef.current) return;
      args.state.hoverRef.current = nextId;
      args.onNodeHover?.(nextId);
      setCursor(nextId ? 'pointer' : 'default');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [args.onNodeHover, pickNode, args.state.hoverRef]
  );
  const clearHover = useCallback(() => {
    args.state.hoverRef.current = null;
    args.onNodeHover?.(null);
    setCursor('default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.onNodeHover, args.state.hoverRef]);
  return { updateHoverFromPointer, clearHover };
}

function useBeginEnd(
  args: UsePointerArgs,
  pickNode: (x: number, y: number) => InternalNode | null,
  toWorld: ReturnType<typeof useToWorld>
) {
  const beginPointerInteraction = useCallback(
    (cx: number, cy: number) => {
      const hit = pickNode(cx, cy);
      if (hit) {
        const { x, y } = toWorld(cx, cy);
        args.state.draggingRef.current = { id: hit.id, dx: x - (hit.x ?? 0), dy: y - (hit.y ?? 0) };
        return;
      }
      if (!args.enableZoom) return;
      args.state.panningRef.current = {
        sx: cx,
        sy: cy,
        ox: args.transform.x,
        oy: args.transform.y,
      };
    },
    [
      args.enableZoom,
      pickNode,
      toWorld,
      args.transform.x,
      args.transform.y,
      args.state.draggingRef,
      args.state.panningRef,
    ]
  );
  const endPointerInteraction = useCallback(
    (cx: number, cy: number) => {
      if (args.state.draggingRef.current) {
        args.state.draggingRef.current = null;
        return;
      }
      args.state.panningRef.current = null;
      const hit = pickNode(cx, cy);
      if (hit && args.onNodeClick) args.onNodeClick(hit.id);
    },
    [args.onNodeClick, pickNode, args.state.draggingRef, args.state.panningRef]
  );
  return { beginPointerInteraction, endPointerInteraction };
}

export function usePointerHandlers(args: UsePointerArgs): PointerHandlers {
  const toWorld = useToWorld(args.canvasRef, args.transform);
  const pickNode = usePickNode(args.nodesRef, toWorld);
  const applyDrag = useDragApply(args, toWorld);
  const applyPan = usePanApply(args);
  const { updateHoverFromPointer, clearHover } = useHoverHandlers(args, pickNode);
  const { beginPointerInteraction, endPointerInteraction } = useBeginEnd(args, pickNode, toWorld);
  const clearInteraction = useCallback(() => {
    args.state.draggingRef.current = null;
    args.state.panningRef.current = null;
    args.state.activePointerIdRef.current = null;
  }, [args.state]);

  return {
    toWorld,
    pickNode,
    applyDrag,
    applyPan,
    updateHoverFromPointer,
    clearHover,
    clearInteraction,
    beginPointerInteraction,
    endPointerInteraction,
  };
}
