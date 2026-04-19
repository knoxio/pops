import { FileText, MapPin, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { Button, PageHeader } from '@pops/ui';

import { LocationContentsPanel } from '../components/LocationContentsPanel';
import { DeleteDialog } from './location-tree-page/sections/DeleteDialog';
import { MoveDialog } from './location-tree-page/sections/MoveDialog';
import { TreeSection } from './location-tree-page/sections/TreeSection';
import { useLocationTreePageModel } from './location-tree-page/useLocationTreePageModel';
import { buildBreadcrumb } from './location-tree-page/utils';

export function LocationTreePage() {
  const {
    treeNodes,
    nodeMap,
    isLoading,
    error,
    selectedId,
    addingChildOf,
    addingRoot,
    setAddingRoot,
    setAddingChildOf,
    movingId,
    setMovingId,
    activeId,
    overId,
    deleteConfirm,
    setDeleteConfirm,
    deleteMutation,
    handleSelect,
    handleAddChild,
    handleRename,
    handleNewChildSave,
    handleNewChildCancel,
    handleNewRootSave,
    handleNewRootCancel,
    handleDelete,
    handleDeleteConfirm,
    handleMoveStart,
    handleMoveTo,
    handleReorder,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useLocationTreePageModel();

  const activeNode = activeId ? nodeMap.get(activeId) : null;
  const movingNode = movingId ? nodeMap.get(movingId) : null;

  if (error) {
    return (
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Locations" icon={<MapPin className="h-6 w-6 text-muted-foreground" />} />
        <p className="text-destructive">Failed to load locations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Locations"
        icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
        actions={
          <>
            <Link
              to="/inventory/report/insurance"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <FileText className="h-4 w-4" />
              Insurance Report
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-app-accent hover:text-app-accent/80"
              prefix={<Plus className="h-4 w-4" />}
              onClick={() => {
                setAddingRoot(true);
                setAddingChildOf(null);
              }}
            >
              Add Root Location
            </Button>
          </>
        }
      />

      {!isLoading && treeNodes.length === 0 && !addingRoot ? (
        <div className="text-center py-16">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">
            No locations yet. Add your first location to start organising.
          </p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          <TreeSection
            treeNodes={treeNodes}
            isLoading={isLoading}
            addingRoot={addingRoot}
            selectedId={selectedId}
            addingChildOf={addingChildOf}
            overId={overId}
            activeId={activeId}
            activeNode={activeNode}
            onSelect={handleSelect}
            onAddChild={handleAddChild}
            onRename={handleRename}
            onMoveStart={handleMoveStart}
            onReorder={handleReorder}
            onDelete={handleDelete}
            onNewChildSave={handleNewChildSave}
            onNewChildCancel={handleNewChildCancel}
            onNewRootSave={handleNewRootSave}
            onNewRootCancel={handleNewRootCancel}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          />
          <div className="md:w-3/5">
            {selectedId && nodeMap.get(selectedId) ? (
              (() => {
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
              })()
            ) : (
              <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
                Select a location to see details
              </div>
            )}
          </div>
        </div>
      )}

      <MoveDialog
        movingId={movingId}
        movingNode={movingNode}
        treeNodes={treeNodes}
        nodeMap={nodeMap}
        onMoveTo={handleMoveTo}
        onClose={() => setMovingId(null)}
      />

      <DeleteDialog
        deleteConfirm={deleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
