import { Plus } from 'lucide-react';

import { Button } from '@pops/ui';

import type { ReactNode } from 'react';

/**
 * CRUDManagementSection — generic section wrapper for list-based CRUD UIs.
 *
 * Renders a consistent header (title + description + optional add button)
 * followed by an inline form slot (when showForm) and a list slot.
 *
 * Used by SourceManagementSection and DimensionManager to share the
 * section chrome without coupling to their specific domain logic.
 */

export interface CRUDManagementSectionProps {
  title: string;
  description?: string;
  addLabel?: string;
  onAdd?: () => void;
  showForm?: boolean;
  form?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CRUDManagementSection({
  title,
  description,
  addLabel = 'Add',
  onAdd,
  showForm,
  form,
  children,
  className,
}: CRUDManagementSectionProps) {
  return (
    <div className={`rounded-lg border bg-card p-6 space-y-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {addLabel}
          </Button>
        )}
      </div>

      {showForm && form && form}

      <div className="space-y-2">{children}</div>
    </div>
  );
}
