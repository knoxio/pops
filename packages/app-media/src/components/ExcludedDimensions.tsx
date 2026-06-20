import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * ExcludedDimensions — shows which comparison dimensions a movie is excluded from
 * and provides an "Include" button to restore it.
 */
import { Button } from '@pops/ui';

import { unwrap } from '../media-api-helpers.js';
import {
  comparisonsIncludeInDimension,
  comparisonsListDimensions,
  comparisonsScores,
} from '../media-api/index.js';

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
  const queryClient = useQueryClient();

  const { data: scoresResponse } = useQuery<ScoresResult>({
    queryKey: ['media', 'comparisons', 'scores', { mediaType, mediaId }],
    queryFn: async () => unwrap(await comparisonsScores({ query: { mediaType, mediaId } })),
  });

  const { data: dimensionsResponse } = useQuery<DimensionsResult>({
    queryKey: ['media', 'comparisons', 'listDimensions'],
    queryFn: async () => unwrap(await comparisonsListDimensions()),
  });

  const scores = scoresResponse?.data ?? [];
  const dimensions = dimensionsResponse?.data ?? [];

  const includeMutation = useMutation({
    mutationFn: async (input: IncludeInDimensionInput) =>
      unwrap(await comparisonsIncludeInDimension({ body: input })),
    onSuccess: (_data, variables) => {
      const dimName = dimensions.find((d) => d.id === variables.dimensionId)?.name ?? 'dimension';
      toast.success(`Included in ${dimName}`);
      void queryClient.invalidateQueries({ queryKey: ['media', 'comparisons'] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to include: ${err.message}`);
    },
  });

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
