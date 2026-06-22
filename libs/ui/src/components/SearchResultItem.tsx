import { Fragment } from 'react';

import { cn } from '../lib/utils';

import type { HTMLAttributes, ReactNode } from 'react';

interface SearchResultItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  /** Icon, thumbnail, or avatar displayed before the text content. */
  leading?: ReactNode;
  /** Primary title line — pass a highlighted node or plain string. */
  title: ReactNode;
  /**
   * Metadata chips rendered below the title.
   * Falsy items are filtered out; a `·` separator is inserted between the
   * remaining items automatically.
   */
  meta?: ReactNode[];
  /** Value, badge, or any trailing node anchored to the right. */
  trailing?: ReactNode;
}

export function SearchResultItem({
  leading,
  title,
  meta,
  trailing,
  className,
  ...props
}: SearchResultItemProps) {
  const visibleMeta =
    meta?.filter((item) => item !== null && item !== undefined && item !== false && item !== '') ??
    [];

  return (
    <div className={cn('flex items-center gap-3 py-1', className)} {...props}>
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight">{title}</span>
        {visibleMeta.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {visibleMeta.map((item, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden>·</span>}
                {item}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}
