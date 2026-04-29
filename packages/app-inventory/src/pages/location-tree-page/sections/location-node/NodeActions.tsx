import { ArrowDown, ArrowUp, FileText, FolderPlus, MoveRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import type { LocationTreeNode } from '../../utils';

interface NodeActionsProps {
  node: LocationTreeNode;
  siblingIndex: number;
  siblingCount: number;
  onAddChild: (parentId: string) => void;
  onMoveStart: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
}

function ReorderButtons({
  node,
  siblingIndex,
  siblingCount,
  onReorder,
}: {
  node: LocationTreeNode;
  siblingIndex: number;
  siblingCount: number;
  onReorder: (id: string, direction: 'up' | 'down') => void;
}) {
  if (siblingCount <= 1) return null;
  return (
    <>
      {siblingIndex > 0 && (
        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted hidden [@media(pointer:coarse)]:inline-flex"
          onClick={(e) => {
            e.stopPropagation();
            onReorder(node.id, 'up');
          }}
          aria-label="Move up"
          title="Move up"
        >
          <ArrowUp className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {siblingIndex < siblingCount - 1 && (
        <button
          type="button"
          className="p-0.5 rounded hover:bg-muted hidden [@media(pointer:coarse)]:inline-flex"
          onClick={(e) => {
            e.stopPropagation();
            onReorder(node.id, 'down');
          }}
          aria-label="Move down"
          title="Move down"
        >
          <ArrowDown className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </>
  );
}

function ActionIconButton({
  ariaLabel,
  title,
  onClick,
  children,
}: {
  ariaLabel: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="p-0.5 rounded hover:bg-muted"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  );
}

function PrimaryActions({
  node,
  onAddChild,
  onMoveStart,
  onDelete,
}: Omit<NodeActionsProps, 'siblingIndex' | 'siblingCount' | 'onReorder'>) {
  return (
    <>
      <ActionIconButton
        ariaLabel={`Move ${node.name}`}
        title="Move to..."
        onClick={(e) => {
          e.stopPropagation();
          onMoveStart(node.id);
        }}
      >
        <MoveRight className="h-3 w-3 text-muted-foreground" />
      </ActionIconButton>
      <ActionIconButton
        ariaLabel={`Add child to ${node.name}`}
        title="Add child location"
        onClick={(e) => {
          e.stopPropagation();
          onAddChild(node.id);
        }}
      >
        <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
      </ActionIconButton>
      <Link
        to={`/inventory/reports/insurance?locationId=${node.id}`}
        onClick={(e) => e.stopPropagation()}
        className="p-0.5 rounded hover:bg-muted"
        title={`Insurance report for ${node.name}`}
      >
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node.id);
        }}
        aria-label={`Delete ${node.name}`}
        title="Delete location"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </>
  );
}

export function NodeActions({
  node,
  siblingIndex,
  siblingCount,
  onAddChild,
  onMoveStart,
  onReorder,
  onDelete,
}: NodeActionsProps) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0">
      <ReorderButtons
        node={node}
        siblingIndex={siblingIndex}
        siblingCount={siblingCount}
        onReorder={onReorder}
      />
      <PrimaryActions
        node={node}
        onAddChild={onAddChild}
        onMoveStart={onMoveStart}
        onDelete={onDelete}
      />
    </div>
  );
}
