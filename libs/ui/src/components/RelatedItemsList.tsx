import * as React from 'react';

import { cn } from '../lib/utils';

export interface RelatedItemsListProps<T extends { id: string | number }> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage?: string;
  action?: React.ReactNode;
  className?: string;
}

export function RelatedItemsList<T extends { id: string | number }>({
  items,
  renderItem,
  emptyMessage = 'No items',
  action,
  className,
}: RelatedItemsListProps<T>) {
  return (
    <div className={cn('space-y-2', className)}>
      {items.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {items.map((item) => (
            <li key={item.id}>{renderItem(item)}</li>
          ))}
        </ul>
      )}
      {action}
    </div>
  );
}
