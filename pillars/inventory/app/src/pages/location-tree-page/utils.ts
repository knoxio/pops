export interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationTreeNode[];
}

export function buildBreadcrumb(nodeId: string, nodeMap: Map<string, LocationTreeNode>): string[] {
  const path: string[] = [];
  let current = nodeMap.get(nodeId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }
  return path;
}

export function buildNodeMap(nodes: LocationTreeNode[], map: Map<string, LocationTreeNode>): void {
  for (const node of nodes) {
    map.set(node.id, node);
    buildNodeMap(node.children, map);
  }
}

export function countDescendants(node: LocationTreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

export function isDescendant(
  nodeId: string,
  targetId: string,
  nodeMap: Map<string, LocationTreeNode>
): boolean {
  const node = nodeMap.get(nodeId);
  if (!node) return false;
  for (const child of node.children) {
    if (child.id === targetId || isDescendant(child.id, targetId, nodeMap)) {
      return true;
    }
  }
  return false;
}

export function getSiblings(
  nodeId: string,
  treeNodes: LocationTreeNode[],
  nodeMap: Map<string, LocationTreeNode>
): LocationTreeNode[] {
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  if (!node.parentId) return treeNodes;
  const parent = nodeMap.get(node.parentId);
  return parent?.children ?? [];
}
