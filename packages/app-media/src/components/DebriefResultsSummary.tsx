import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Minus,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';

/**
 * DebriefResultsSummary — shows per-dimension results and ELO score
 * changes after completing a debrief session.
 *
 * Fetches session data via getDebrief and current scores for the movie.
 */
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@pops/ui';

import { trpc } from '../lib/trpc';

interface DebriefResultsSummaryProps {
  mediaType: 'movie' | 'episode';
  mediaId: number;
}

export function DebriefResultsSummary({ mediaType, mediaId }: DebriefResultsSummaryProps) {
  const navigate = useNavigate();

  const {
    data: debriefData,
    isLoading,
    error,
  } = trpc.media.comparisons.getDebrief.useQuery({ mediaType, mediaId });

  const debrief = debriefData?.data;

  // Fetch current scores for the debriefed movie
  const { data: scoresData } = trpc.media.comparisons.scores.useQuery(
    { mediaType: 'movie', mediaId: debrief?.movie.mediaId ?? 0 },
    { enabled: !!debrief }
  );

  if (isLoading) {
    return <DebriefResultsSummarySkeleton />;
  }

  if (error || !debrief) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="results-error">
        <p className="text-lg mb-2">Could not load debrief results</p>
        <p className="text-sm">{error?.message ?? 'Session not found'}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/media')}>
          Back to Library
        </Button>
      </div>
    );
  }

  const compared = debrief.dimensions.filter(
    (d) => d.status === 'complete' && d.comparisonId !== null
  );
  const skipped = debrief.dimensions.filter(
    (d) => d.status === 'complete' && d.comparisonId === null
  );
  const pending = debrief.dimensions.filter((d) => d.status === 'pending');

  // Build score map: dimensionId -> score
  const scoreByDimension = new Map(
    (scoresData?.data ?? []).map((s: { dimensionId: number; score: number }) => [
      s.dimensionId,
      s.score,
    ])
  );

  return (
    <div className="space-y-6" data-testid="debrief-results-summary">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">Debrief Results</CardTitle>
          </div>
          <p className="text-muted-foreground text-sm">
            Results for <strong>{debrief.movie.title}</strong>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Per-dimension results */}
          <div className="space-y-2">
            {debrief.dimensions.map((dim) => {
              const score = scoreByDimension.get(dim.dimensionId);
              return (
                <div
                  key={dim.dimensionId}
                  className="flex items-center justify-between text-sm rounded-lg border p-3"
                >
                  <span className="font-medium">{dim.name}</span>
                  <div className="flex items-center gap-2">
                    {score != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(score)}</span>
                    )}
                    {dim.status === 'complete' && dim.comparisonId !== null ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Compared
                      </Badge>
                    ) : dim.status === 'complete' && dim.comparisonId === null ? (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Skipped
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall ELO scores */}
          {scoresData?.data && scoresData.data.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Current Scores</h3>
              <div className="space-y-1.5">
                {(scoresData.data as { dimensionId: number; score: number }[]).map((s) => {
                  const delta = Math.round(s.score - 1500);
                  const isPositive = delta > 0;
                  const isNegative = delta < 0;
                  const dimName =
                    debrief.dimensions.find((d) => d.dimensionId === s.dimensionId)?.name ??
                    `Dimension ${s.dimensionId}`;
                  return (
                    <div key={s.dimensionId} className="flex items-center justify-between text-sm">
                      <span>{dimName}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{Math.round(s.score)}</span>
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                            isPositive
                              ? 'bg-success/20 text-success'
                              : isNegative
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-muted text-muted-foreground'
                          }`}
                          data-testid={`score-delta-${s.dimensionId}`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : isNegative ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {isPositive ? '+' : ''}
                          {delta}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary counts */}
          <div className="text-muted-foreground border-t pt-3 text-sm">
            {compared.length} compared, {skipped.length} skipped
            {pending.length > 0 ? `, ${pending.length} pending` : ''}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/media/movies/${debrief.movie.mediaId}`)}
              data-testid="back-to-movie-btn"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Movie
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/media')}
              data-testid="done-btn"
            >
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DebriefResultsSummarySkeleton() {
  return (
    <Card data-testid="results-loading">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}
