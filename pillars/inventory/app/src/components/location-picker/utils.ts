export interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children: LocationTreeNode[];
}

/** Build breadcrumb path from root to target node. */
export function buildPath(nodes: LocationTreeNode[], targetId: string): LocationTreeNode[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    const childPath = buildPath(node.children, targetId);
    if (childPath.length > 0) return [node, ...childPath];
  }
  return [];
}

/** Flatten tree for search, returning nodes that match filter. */
export function filterTree(nodes: LocationTreeNode[], query: string): Set<string> {
  const matches = new Set<string>();
  const lower = query.toLowerCase();

  function walk(node: LocationTreeNode, ancestors: string[]): void {
    const nameMatches = node.name.toLowerCase().includes(lower);
    let anyChildMatched = false;
    for (const child of node.children) {
      walk(child, [...ancestors, node.id]);
      if (matches.has(child.id)) anyChildMatched = true;
    }
    if (nameMatches || anyChildMatched) {
      matches.add(node.id);
      for (const aid of ancestors) matches.add(aid);
    }
  }

  for (const node of nodes) walk(node, []);
  return matches;
}
