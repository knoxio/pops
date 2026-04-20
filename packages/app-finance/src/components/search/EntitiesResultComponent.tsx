import { registerResultComponent } from '@pops/navigation';
import { Badge, highlightMatch, SearchResultItem } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

interface EntityHitData {
  name: string;
  type: string;
  aliases: string[];
  query?: string;
  matchField?: string;
  matchType?: 'exact' | 'prefix' | 'contains';
}

const entityTypeStyles: Record<string, string> = {
  company: 'bg-info/10 text-info border-info/20 dark:text-info/80',
  person: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-400',
  place: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400',
  brand: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-400',
  organisation: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
};

export function EntitiesResultComponent({ data }: ResultComponentProps) {
  const { name, type, aliases, query } = data as unknown as EntityHitData;

  const style = entityTypeStyles[type] ?? 'bg-muted text-muted-foreground border-transparent';

  return (
    <SearchResultItem
      title={highlightMatch(name, query ?? '')}
      meta={
        aliases.length > 0
          ? [
              <span key="aliases" className="min-w-0 truncate">
                {aliases.join(', ')}
              </span>,
            ]
          : undefined
      }
      trailing={
        <Badge
          variant="outline"
          className={`text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5 shrink-0 ${style}`}
        >
          {type}
        </Badge>
      }
    />
  );
}

registerResultComponent('entities', EntitiesResultComponent);
