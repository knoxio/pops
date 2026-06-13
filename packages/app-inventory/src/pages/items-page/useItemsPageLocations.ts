import type { LocationSegment, SelectOption } from '@pops/ui';

type TreeNode = { id: string; name: string; children: TreeNode[] };

export type LocationTreeNodeShape = TreeNode;

export function flattenLocations(nodes: TreeNode[]): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: 'All Locations' }];
  function walk(items: TreeNode[], depth: number): void {
    for (const node of items) {
      const indent = depth > 0 ? '  '.repeat(depth) + '└ ' : '';
      opts.push({ value: node.id, label: `${indent}${node.name}` });
      walk(node.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return opts;
}

export function buildLocationPathMap(nodes: TreeNode[]): ReadonlyMap<string, LocationSegment[]> {
  const map = new Map<string, LocationSegment[]>();
  function walk(items: TreeNode[], ancestors: LocationSegment[]): void {
    for (const node of items) {
      const path = [...ancestors, { id: node.id, name: node.name }];
      map.set(node.id, path);
      walk(node.children, path);
    }
  }
  walk(nodes, []);
  return map;
}
