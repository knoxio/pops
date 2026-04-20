import { GRAPH_COLORS } from '@pops/ui/theme/graph-colors';

import type { GraphLink, GraphNode, Transform } from './types';

export const NODE_RADIUS = 24;
const LABEL_OFFSET = NODE_RADIUS + 10;

interface StructuralColors {
  edge: string;
  currentBorder: string;
  iconText: string;
  label: string;
  legendText: string;
}

export function getStructuralColors(): StructuralColors {
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

export function getNodeColor(type: string | null): string {
  if (!type) return GRAPH_COLORS.node.default;
  return GRAPH_COLORS.types[type.toLowerCase()] ?? GRAPH_COLORS.node.default;
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  links: GraphLink[],
  color: string,
  t: Transform
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / t.k;
  for (const link of links) {
    const sx = link.source.x ?? 0;
    const sy = link.source.y ?? 0;
    const tx = link.target.x ?? 0;
    const ty = link.target.y ?? 0;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
}

interface DrawNodeArgs {
  node: GraphNode;
  itemId: string;
  colors: StructuralColors;
  t: Transform;
}

function drawNode(ctx: CanvasRenderingContext2D, args: DrawNodeArgs): void {
  const { node, itemId, colors, t } = args;
  const nx = node.x ?? 0;
  const ny = node.y ?? 0;
  const isCurrent = node.id === itemId;
  const color = isCurrent ? GRAPH_COLORS.node.current : getNodeColor(node.type);

  ctx.beginPath();
  ctx.arc(nx, ny, NODE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (isCurrent) {
    ctx.lineWidth = 3 / t.k;
    ctx.strokeStyle = colors.currentBorder;
    ctx.stroke();
  }

  ctx.fillStyle = colors.iconText;
  ctx.font = `bold ${14 / t.k}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const initial = (node.type ?? node.itemName).charAt(0).toUpperCase();
  ctx.fillText(initial, nx, ny);

  ctx.fillStyle = colors.label;
  ctx.font = `${11 / t.k}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const label = node.itemName.length > 20 ? node.itemName.slice(0, 18) + '...' : node.itemName;
  ctx.fillText(label, nx, ny + LABEL_OFFSET / t.k);
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  colors: StructuralColors,
  dpr: number
): void {
  const types = new Set(nodes.map((n) => n.type).filter(Boolean));
  if (types.size === 0) return;
  ctx.save();
  ctx.scale(dpr, dpr);
  let ly = 12;
  ctx.font = '11px system-ui, sans-serif';
  for (const type of types) {
    if (!type) continue;
    ctx.fillStyle = getNodeColor(type);
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

interface DrawArgs {
  canvas: HTMLCanvasElement;
  nodes: GraphNode[];
  links: GraphLink[];
  transform: Transform;
  itemId: string;
}

export function drawGraph({ canvas, nodes, links, transform, itemId }: DrawArgs): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const colors = getStructuralColors();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  drawEdges(ctx, links, colors.edge, transform);
  for (const node of nodes) drawNode(ctx, { node, itemId, colors, t: transform });
  ctx.restore();

  drawLegend(ctx, nodes, colors, dpr);
}
