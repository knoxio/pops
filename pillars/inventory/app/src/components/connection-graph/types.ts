import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  itemName: string;
  assetId: string | null;
  type: string | null;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}
