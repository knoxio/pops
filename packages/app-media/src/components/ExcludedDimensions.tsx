/**
 * ExcludedDimensions — shows which comparison dimensions a movie is excluded from
 * and provides an "Include" button to restore it.
 */
import { Button } from '@pops/ui';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

export interface ExcludedDimensionsProps {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
}

export function ExcludedDimensions({ mediaType, mediaId }: ExcludedDimensionsProps) {
  const utils = trpc.useUtils();

  const { data: scoresResponse } = trpc.media.comparisons.scores.useQuery({
    mediaType,
    mediaId,
  });

  const { data: dimensionsResponse } = trpc.media.comparisons.listDimensions.useQuery();

  const includeMutation = trpc.media.comparisons.includeInDimension.useMutation({
    onSuccess: (_data, variables) => {
      const dimName = dimensions.find((d) => d.id === variables.dimensionId)?.name ?? 'dimension';
      toast.success(`Included in ${dimName}`);
      void utils.media.comparisons.scores.invalidate({ mediaType, mediaId });
    },
    onError: (err) => {
      toast.error(`Failed to include: ${err.message}`);
    },
  });

  const scores = scoresResponse?.data ?? [];
  const dimensions = dimensionsResponse?.data ?? [];

  // Find excluded dimensions by matching scores with excluded=true
  const excludedScores = scores.filter((s: { excluded: boolean }) => s.excluded);

  if (excludedScores.length === 0) return null;

  // Build dimension name lookup
  const dimensionMap = new Map(dimensions.map((d: { id: number; name: string }) => [d.id, d.name]));

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Excluded Dimensions</h2>
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-sm text-muted-foreground mb-3">
          This movie is excluded from the following comparison dimensions:
        </p>
        {excludedScores.map((s: { dimensionId: number }) => (
          <div
            key={s.dimensionId}
            className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50"
          >
            <span className="text-sm font-medium">
              {dimensionMap.get(s.dimensionId) ?? `Dimension ${s.dimensionId}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={includeMutation.isPending}
              onClick={() =>
                includeMutation.mutate({
                  mediaType,
                  mediaId,
                  dimensionId: s.dimensionId,
                })
              }
            >
              Include
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
