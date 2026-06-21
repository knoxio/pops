import { Settings } from 'lucide-react';

/**
 * DimensionManager — CRUD panel for comparison dimensions.
 *
 * Accessed from CompareArenaPage via a gear icon. Lets users add,
 * edit, deactivate, and reorder comparison dimensions.
 */
import {
  Button,
  CRUDManagementSection,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pops/ui';

import { AddDimensionForm } from './dimension-manager/AddDimensionForm';
import { DimensionListItem } from './dimension-manager/DimensionListItem';
import {
  useDimensionManagerModel,
  type DimensionManagerModel,
} from './dimension-manager/useDimensionManagerModel';

import type { Dimension } from './dimension-manager/types';

function DimensionList({ model }: { model: DimensionManagerModel }) {
  const {
    isLoading,
    sorted,
    editing,
    setEditing,
    handleSaveEdit,
    handleReorder,
    handleStartEdit,
    handleToggleActive,
    handleWeightDrag,
    handleWeightCommit,
    localWeights,
    isPending,
  } = model;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>;
  }
  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No dimensions yet. Add one above.
      </p>
    );
  }
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {sorted.map((dim: Dimension, idx: number) => (
        <DimensionListItem
          key={dim.id}
          dim={dim}
          idx={idx}
          isLast={idx === sorted.length - 1}
          editing={editing}
          setEditing={setEditing}
          onSaveEdit={handleSaveEdit}
          onReorder={(direction) => {
            handleReorder(dim, direction);
          }}
          onStartEdit={() => {
            handleStartEdit(dim);
          }}
          onToggleActive={() => {
            handleToggleActive(dim);
          }}
          onWeightDrag={(v) => {
            handleWeightDrag(dim.id, v);
          }}
          onWeightCommit={(v) => {
            handleWeightCommit(dim, v);
          }}
          localWeight={localWeights.get(dim.id) ?? dim.weight}
          isPending={isPending}
        />
      ))}
    </div>
  );
}

export function DimensionManager() {
  const model = useDimensionManagerModel();
  const {
    open,
    setOpen,
    showAddForm,
    setShowAddForm,
    addName,
    setAddName,
    addDescription,
    setAddDescription,
    handleAdd,
    isCreatePending,
  } = model;

  const addForm = (
    <AddDimensionForm
      addName={addName}
      setAddName={setAddName}
      addDescription={addDescription}
      setAddDescription={setAddDescription}
      onAdd={handleAdd}
      onCancel={() => {
        setShowAddForm(false);
        setAddName('');
        setAddDescription('');
      }}
      isPending={isCreatePending}
    />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Manage dimensions">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Comparison Dimensions</DialogTitle>
          <DialogDescription className="sr-only">
            Manage the dimensions used for comparing media
          </DialogDescription>
        </DialogHeader>
        <CRUDManagementSection
          title="Comparison Dimensions"
          addLabel="Add Dimension"
          onAdd={() => {
            setAddName('');
            setAddDescription('');
            setShowAddForm(true);
          }}
          showForm={showAddForm}
          form={addForm}
        >
          <DimensionList model={model} />
        </CRUDManagementSection>
      </DialogContent>
    </Dialog>
  );
}
