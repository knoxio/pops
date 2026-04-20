import { LocationContentsPanel } from '../../../components/LocationContentsPanel';
import { buildBreadcrumb, type LocationTreeNode } from '../utils';

interface SelectedLocationPanelProps {
  selectedId: string | null;
  nodeMap: Map<string, LocationTreeNode>;
}

export function SelectedLocationPanel({ selectedId, nodeMap }: SelectedLocationPanelProps) {
  if (!selectedId) {
    return (
      <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
        Select a location to see details
      </div>
    );
  }
  const selectedNode = nodeMap.get(selectedId);
  if (!selectedNode) return null;
  return (
    <LocationContentsPanel
      locationId={selectedId}
      locationName={selectedNode.name}
      breadcrumb={buildBreadcrumb(selectedId, nodeMap)}
      node={selectedNode}
    />
  );
}
