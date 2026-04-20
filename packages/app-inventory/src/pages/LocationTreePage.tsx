import { MapPin } from 'lucide-react';

import { PageHeader } from '@pops/ui';

import { DeleteDialog } from './location-tree-page/sections/DeleteDialog';
import { MoveDialog } from './location-tree-page/sections/MoveDialog';
import { PageHeaderActions } from './location-tree-page/sections/PageHeaderActions';
import { SelectedLocationPanel } from './location-tree-page/sections/SelectedLocationPanel';
import { TreeSection } from './location-tree-page/sections/TreeSection';
import { useLocationTreePageModel } from './location-tree-page/useLocationTreePageModel';

type Model = ReturnType<typeof useLocationTreePageModel>;

function EmptyState() {
  return (
    <div className="text-center py-16">
      <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground">
        No locations yet. Add your first location to start organising.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Locations" icon={<MapPin className="h-6 w-6 text-muted-foreground" />} />
      <p className="text-destructive">Failed to load locations.</p>
    </div>
  );
}

function TreeAndPanel({ model }: { model: Model }) {
  const activeNode = model.activeId ? model.nodeMap.get(model.activeId) : null;
  return (
    <div className="flex flex-col md:flex-row gap-6">
      <TreeSection
        treeNodes={model.treeNodes}
        isLoading={model.isLoading}
        addingRoot={model.addingRoot}
        selectedId={model.selectedId}
        addingChildOf={model.addingChildOf}
        overId={model.overId}
        activeId={model.activeId}
        activeNode={activeNode}
        onSelect={model.handleSelect}
        onAddChild={model.handleAddChild}
        onRename={model.handleRename}
        onMoveStart={model.handleMoveStart}
        onReorder={model.handleReorder}
        onDelete={model.handleDelete}
        onNewChildSave={model.handleNewChildSave}
        onNewChildCancel={model.handleNewChildCancel}
        onNewRootSave={model.handleNewRootSave}
        onNewRootCancel={model.handleNewRootCancel}
        onDragStart={model.handleDragStart}
        onDragOver={model.handleDragOver}
        onDragEnd={model.handleDragEnd}
      />
      <div className="md:w-3/5">
        <SelectedLocationPanel selectedId={model.selectedId} nodeMap={model.nodeMap} />
      </div>
    </div>
  );
}

export function LocationTreePage() {
  const model = useLocationTreePageModel();
  if (model.error) return <ErrorState />;

  const showEmpty = !model.isLoading && model.treeNodes.length === 0 && !model.addingRoot;
  const movingNode = model.movingId ? model.nodeMap.get(model.movingId) : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Locations"
        icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
        actions={
          <PageHeaderActions
            onAddRoot={() => {
              model.setAddingRoot(true);
              model.setAddingChildOf(null);
            }}
          />
        }
      />
      {showEmpty ? <EmptyState /> : <TreeAndPanel model={model} />}
      <MoveDialog
        movingId={model.movingId}
        movingNode={movingNode}
        treeNodes={model.treeNodes}
        nodeMap={model.nodeMap}
        onMoveTo={model.handleMoveTo}
        onClose={() => model.setMovingId(null)}
      />
      <DeleteDialog
        deleteConfirm={model.deleteConfirm}
        onConfirm={model.handleDeleteConfirm}
        onCancel={() => model.setDeleteConfirm(null)}
        isPending={model.deleteMutation.isPending}
      />
    </div>
  );
}
