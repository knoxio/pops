import { cn } from '@pops/ui';

export function DimensionChips({
  activeDimensions,
  effectiveDimension,
  onChange,
}: {
  activeDimensions: { id: number; name: string }[];
  effectiveDimension: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap justify-center gap-2"
      role="tablist"
      aria-label="Dimension selector"
    >
      {activeDimensions.map((dim) => (
        <button
          key={dim.id}
          role="tab"
          aria-selected={effectiveDimension === dim.id}
          onClick={() => onChange(dim.id)}
          className={cn(
            'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
            effectiveDimension === dim.id
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
          )}
        >
          {dim.name}
        </button>
      ))}
    </div>
  );
}
