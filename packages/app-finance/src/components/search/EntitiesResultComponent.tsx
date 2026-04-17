import type { ResultComponentProps } from '@pops/navigation';
import { registerResultComponent } from '@pops/navigation';
import { Badge } from '@pops/ui';

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

function highlightMatch(text: string, query?: string): React.ReactNode {
  if (!query) return text;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <>
      {before}
      <mark className="bg-warning/20 rounded-sm px-0.5">{match}</mark>
      {after}
    </>
  );
}

export function EntitiesResultComponent({ data }: ResultComponentProps) {
  const { name, type, aliases, query } = data as unknown as EntityHitData;

  const style = entityTypeStyles[type] || 'bg-muted text-muted-foreground border-transparent';

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{highlightMatch(name, query)}</span>
        {aliases.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">{aliases.join(', ')}</span>
        )}
      </div>
      <Badge
        variant="outline"
        className={`text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5 shrink-0 ${style}`}
      >
        {type}
      </Badge>
    </div>
  );
}

registerResultComponent('entities', EntitiesResultComponent);
