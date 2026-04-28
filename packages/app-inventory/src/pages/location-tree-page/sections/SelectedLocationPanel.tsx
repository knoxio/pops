import { useTranslation } from 'react-i18next';

import { LocationContentsPanel } from '../../../components/LocationContentsPanel';
import { buildBreadcrumb, type LocationTreeNode } from '../utils';

interface SelectedLocationPanelProps {
  selectedId: string | null;
  nodeMap: Map<string, LocationTreeNode>;
}

export function SelectedLocationPanel({ selectedId, nodeMap }: SelectedLocationPanelProps) {
  const { t } = useTranslation('inventory');
  if (!selectedId) {
    return (
      <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
        {t('locations.selectToSeeDetails')}
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
