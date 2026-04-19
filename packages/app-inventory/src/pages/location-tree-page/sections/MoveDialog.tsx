import { Folder, MapPin } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { isDescendant, type LocationTreeNode } from '../utils';

function MoveTargetPicker({
  nodes,
  movingId,
  nodeMap,
  onSelect,
  depth = 0,
}: {
  nodes: LocationTreeNode[];
  movingId: string;
  nodeMap: Map<string, LocationTreeNode>;
  onSelect: (parentId: string | null) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes
        .filter((n) => n.id !== movingId)
        .map((node) => {
          const disabled = isDescendant(movingId, node.id, nodeMap);
          return (
            <div key={node.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(node.id)}
                className={`w-full text-left flex items-center gap-1.5 py-1.5 px-2 rounded-md transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}
                style={{ paddingLeft: `calc(${depth} * var(--tree-picker-step) + var(--tree-indent-base))` }}
              >
                <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{node.name}</span>
              </button>
              {node.children.length > 0 && (
                <MoveTargetPicker nodes={node.children} movingId={movingId} nodeMap={nodeMap} onSelect={onSelect} depth={depth + 1} />
              )}
            </div>
          );
        })}
    </>
  );
}

interface MoveDialogProps {
  movingId: string | null;
  movingNode: LocationTreeNode | null | undefined;
  treeNodes: LocationTreeNode[];
  nodeMap: Map<string, LocationTreeNode>;
  onMoveTo: (parentId: string | null) => void;
  onClose: () => void;
}

export function MoveDialog({ movingId, movingNode, treeNodes, nodeMap, onMoveTo, onClose }: MoveDialogProps) {
  return (
    <Dialog open={!!movingId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move &ldquo;{movingNode?.name}&rdquo;</DialogTitle>
          <DialogDescription>Select a new parent location, or move to root level.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto border rounded-lg py-2">
          <button
            type="button"
            onClick={() => onMoveTo(null)}
            className="w-full text-left flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-muted/50"
            style={{ paddingLeft: 'var(--tree-indent-base)' }}
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Root level</span>
          </button>
          {movingId && (
            <MoveTargetPicker nodes={treeNodes} movingId={movingId} nodeMap={nodeMap} onSelect={onMoveTo} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
