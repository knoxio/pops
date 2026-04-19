import type { ForceEdge, ForceNode } from './ForceGraph';

export interface InternalNode extends ForceNode {
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

export function seedInternalNodes(
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

export function simulateStep(nodes: Map<string, InternalNode>, edges: ForceEdge[]) {
  const list = Array.from(nodes.values());

  for (const n of list) {
    n.fx = 0;
    n.fy = 0;
  }

  // Repulsion.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a || !b) continue;
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

export function applyCanvasTransform(
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

export function drawEdges(
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

export function drawNodes(
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

export function screenToWorld(
  canvasRect: DOMRect,
  transform: { x: number; y: number; k: number },
  clientX: number,
  clientY: number
) {
  const cx = clientX - canvasRect.left - canvasRect.width / 2 - transform.x;
  const cy = clientY - canvasRect.top - canvasRect.height / 2 - transform.y;
  return { x: cx / transform.k, y: cy / transform.k };
}

export function pickNodeAtPoint(
  nodes: Iterable<InternalNode>,
  x: number,
  y: number
): InternalNode | null {
  for (const n of nodes) {
    const r = n.radius ?? 8;
    const dx = (n.x ?? 0) - x;
    const dy = (n.y ?? 0) - y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}
