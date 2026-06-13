import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';
/**
 * ExcludedDimensions — shows which comparison dimensions a movie is excluded from
 * and provides an "Include" button to restore it.
 */
import { Button } from '@pops/ui';

export interface ExcludedDimensionsProps {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
}

interface ScoreEntry {
  dimensionId: number;
  excluded: boolean;
}

interface DimensionEntry {
  id: number;
  name: string;
}

interface ScoresResult {
  data: ScoreEntry[];
}

interface DimensionsResult {
  data: DimensionEntry[];
}

interface IncludeInDimensionInput {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
  dimensionId: number;
}

function useExcludedDimensionsModel(mediaType: 'movie' | 'tv_show', mediaId: number) {
  const { data: scoresResponse } = usePillarQuery<ScoresResult>(
    'media',
    ['comparisons', 'scores'],
    { mediaType, mediaId }
  );

  const { data: dimensionsResponse } = usePillarQuery<DimensionsResult>(
    'media',
    ['comparisons', 'listDimensions'],
    undefined
  );

  const scores = scoresResponse?.data ?? [];
  const dimensions = dimensionsResponse?.data ?? [];

  const includeMutation = usePillarMutation<IncludeInDimensionInput, unknown>(
    'media',
    ['comparisons', 'includeInDimension'],
    {
      onSuccess: (_data, variables) => {
        const dimName = dimensions.find((d) => d.id === variables.dimensionId)?.name ?? 'dimension';
        toast.success(`Included in ${dimName}`);
      },
      onError: (err) => {
        toast.error(`Failed to include: ${err.message}`);
      },
    }
  );

  return { scores, dimensions, includeMutation };
}

function ExcludedRow({
  score,
  dimensionMap,
  isPending,
  onInclude,
}: {
  score: ScoreEntry;
  dimensionMap: Map<number, string>;
  isPending: boolean;
  onInclude: (dimensionId: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50">
      <span className="text-sm font-medium">
        {dimensionMap.get(score.dimensionId) ?? `Dimension ${score.dimensionId}`}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          onInclude(score.dimensionId);
        }}
      >
        Include
      </Button>
    </div>
  );
}

export function ExcludedDimensions({ mediaType, mediaId }: ExcludedDimensionsProps) {
  const { scores, dimensions, includeMutation } = useExcludedDimensionsModel(mediaType, mediaId);
  const excludedScores = scores.filter((s) => s.excluded);
  if (excludedScores.length === 0) return null;

  const dimensionMap = new Map(dimensions.map((d) => [d.id, d.name]));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Excluded Dimensions</h2>
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-sm text-muted-foreground mb-3">
          This movie is excluded from the following comparison dimensions:
        </p>
        {excludedScores.map((s) => (
          <ExcludedRow
            key={s.dimensionId}
            score={s}
            dimensionMap={dimensionMap}
            isPending={includeMutation.isPending}
            onInclude={(dimensionId) => {
              includeMutation.mutate({ mediaType, mediaId, dimensionId });
            }}
          />
        ))}
      </div>
    </section>
  );
}
