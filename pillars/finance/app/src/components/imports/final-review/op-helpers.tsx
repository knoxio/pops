import { Ban, Pencil, Plus, Trash2 } from 'lucide-react';

export type ChangeSetOp =
  | { op: 'add'; data: { descriptionPattern: string; [k: string]: unknown } }
  | { op: 'edit'; id: string; data: { entityName?: string | null; [k: string]: unknown } }
  | { op: 'disable'; id: string }
  | { op: 'remove'; id: string };

export type TagRuleChangeSetOp =
  | { op: 'add'; data: { descriptionPattern: string; tags?: string[]; [k: string]: unknown } }
  | { op: 'edit'; id: string; data: Record<string, unknown> }
  | { op: 'disable'; id: string }
  | { op: 'remove'; id: string };

export const OP_BADGE: Record<string, { label: string; icon: React.ReactNode; className: string }> =
  {
    add: {
      label: 'Add',
      icon: <Plus className="h-3 w-3" />,
      className: 'bg-success/10 text-success dark:bg-success/10 dark:text-success/60',
    },
    edit: {
      label: 'Edit',
      icon: <Pencil className="h-3 w-3" />,
      className: 'bg-info/10 text-info dark:bg-info/10 dark:text-info/60',
    },
    disable: {
      label: 'Disable',
      icon: <Ban className="h-3 w-3" />,
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    },
    remove: {
      label: 'Remove',
      icon: <Trash2 className="h-3 w-3" />,
      className:
        'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive/60',
    },
  };

export function opDisplayLabel(op: ChangeSetOp): string {
  switch (op.op) {
    case 'add':
      return op.data.descriptionPattern;
    case 'edit':
      return op.data.entityName ?? `Rule ${op.id.slice(0, 8)}`;
    case 'disable':
    case 'remove':
      return `Rule ${op.id.slice(0, 8)}`;
  }
}

export function tagRuleOpDisplayLabel(op: TagRuleChangeSetOp): string {
  switch (op.op) {
    case 'add': {
      const tags = op.data.tags?.length ? ` → ${op.data.tags.join(', ')}` : '';
      return `${op.data.descriptionPattern}${tags}`;
    }
    case 'edit':
    case 'disable':
    case 'remove':
      return `Rule ${op.id.slice(0, 8)}`;
  }
}
