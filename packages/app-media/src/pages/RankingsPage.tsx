import { Trophy } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { trpc } from '@pops/api-client';
/**
 * RankingsPage — leaderboard of media items ranked by Elo score.
 */
import { cn, Tabs, TabsContent } from '@pops/ui';

import { RankingsList } from './rankings/RankingsList';
import { RankingsSkeleton } from './rankings/RankingsSkeleton';

interface Dimension {
  id: number;
  name: string;
  active: boolean;
}

function DimensionChips({
  chips,
  dimensionParam,
  onChange,
}: {
  chips: { value: string; label: string }[];
  dimensionParam: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="tablist">
      {chips.map((chip) => (
        <button
          key={chip.value}
          role="tab"
          aria-selected={dimensionParam === chip.value}
          onClick={() => onChange(chip.value)}
          className={cn(
            'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
            dimensionParam === chip.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function RankingsTabs({
  activeDimensions,
  dimensionParam,
  onChange,
}: {
  activeDimensions: Dimension[];
  dimensionParam: string;
  onChange: (v: string) => void;
}) {
  const chips = [
    { value: 'overall', label: 'Overall' },
    ...activeDimensions.map((dim) => ({ value: String(dim.id), label: dim.name })),
  ];
  return (
    <Tabs value={dimensionParam} onValueChange={onChange}>
      <DimensionChips chips={chips} dimensionParam={dimensionParam} onChange={onChange} />
      <TabsContent value="overall" className="mt-4">
        <RankingsList />
      </TabsContent>
      {activeDimensions.map((dim) => (
        <TabsContent key={dim.id} value={String(dim.id)} className="mt-4">
          <RankingsList dimensionId={dim.id} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function RankingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dimensionParam = searchParams.get('dimension') ?? 'overall';

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo<Dimension[]>(
    () => (dimensionsData?.data ?? []).filter((d: Dimension) => d.active),
    [dimensionsData?.data]
  );

  const showTabs = activeDimensions.length > 0;

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === 'overall') next.delete('dimension');
          else next.set('dimension', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  function renderBody() {
    if (dimsLoading) return <RankingsSkeleton />;
    if (!showTabs) return <RankingsList />;
    return (
      <RankingsTabs
        activeDimensions={activeDimensions}
        dimensionParam={dimensionParam}
        onChange={handleTabChange}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-warning" />
        <h1 className="text-2xl font-bold">Rankings</h1>
      </div>
      {renderBody()}
    </div>
  );
}
