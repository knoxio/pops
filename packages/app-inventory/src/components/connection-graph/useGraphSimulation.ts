import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { useEffect, useRef, type RefObject } from 'react';

import { drawGraph, NODE_RADIUS } from './draw';

import type { GraphLink, GraphNode, Transform } from './types';

interface RawGraphData {
  nodes: Array<{ id: string; itemName: string; assetId: string | null; type: string | null }>;
  edges: Array<{ source: string; target: string }>;
}

function buildGraph(raw: RawGraphData): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodeMap = new Map<string, GraphNode>();
  const nodes: GraphNode[] = raw.nodes.map((n) => {
    const gn: GraphNode = { ...n, x: 0, y: 0 };
    nodeMap.set(n.id, gn);
    return gn;
  });
  const links: GraphLink[] = raw.edges
    .map((e) => {
      const source = nodeMap.get(e.source);
      const target = nodeMap.get(e.target);
      if (!source || !target) return null;
      return { source, target };
    })
    .filter((l): l is GraphLink => l !== null);
  return { nodes, links };
}

function sizeCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement
): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  return { width: rect.width, height: rect.height };
}

interface UseGraphSimulationArgs {
  rawData: RawGraphData | null | undefined;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  itemId: string;
  nodesRef: RefObject<GraphNode[]>;
  linksRef: RefObject<GraphLink[]>;
  transformRef: RefObject<Transform>;
}

export function useGraphSimulation({
  rawData,
  canvasRef,
  containerRef,
  itemId,
  nodesRef,
  linksRef,
  transformRef,
}: UseGraphSimulationArgs): void {
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawGraph({
      canvas,
      nodes: nodesRef.current ?? [],
      links: linksRef.current ?? [],
      transform: transformRef.current ?? { x: 0, y: 0, k: 1 },
      itemId,
    });
  };

  useEffect(() => {
    if (!rawData || !canvasRef.current || !containerRef.current) return;
    if (rawData.nodes.length === 0) return;

    const { width, height } = sizeCanvas(canvasRef.current, containerRef.current);
    transformRef.current.x = width / 2;
    transformRef.current.y = height / 2;
    transformRef.current.k = 1;

    const { nodes, links } = buildGraph(rawData);
    nodesRef.current.length = 0;
    nodesRef.current.push(...nodes);
    linksRef.current.length = 0;
    linksRef.current.push(...links);

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
      .on('tick', () => drawRef.current());

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, itemId]);
}
