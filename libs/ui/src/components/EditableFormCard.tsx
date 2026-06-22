import { cn } from '../lib/utils';

import type { KeyboardEvent, ReactNode } from 'react';

export interface EditableFormCardProps {
  /** Title shown in the card header */
  title?: string;
  /** Action buttons to render in the header (e.g. Save / Cancel) */
  actions?: ReactNode;
  /** Card content */
  children: ReactNode;
  /** Called when Escape is pressed anywhere inside the card */
  onEscape?: () => void;
  className?: string;
}

/**
 * Bordered card shell for inline editing forms (entity assignment, transaction edit, etc.).
 * Provides the header bar with title + actions and an Escape key handler.
 */
export function EditableFormCard({
  title,
  actions,
  children,
  onEscape,
  className,
}: EditableFormCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') onEscape?.();
  };

  return (
    <div
      className={cn('border-2 border-info rounded-lg p-4 bg-info/5', className)}
      onKeyDown={handleKeyDown}
    >
      {(title ?? actions) && (
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-info/20">
          {title && <h3 className="font-semibold text-info">{title}</h3>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
