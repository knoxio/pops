import { ArrowLeft, CheckCircle, Clock, Trophy, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';

import { trpc } from '@pops/api-client';
/**
 * DebriefResultsSummary — shows per-dimension results and ELO score
 * changes after completing a debrief session.
 *
 * Fetches session data via getDebrief and current scores for the movie.
 */
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@pops/ui';

import { CurrentScoresList } from './DebriefResultsScores';

interface DebriefResultsSummaryProps {
  mediaType: 'movie' | 'episode';
  mediaId: number;
}

interface DimensionEntry {
  dimensionId: number;
  name: string;
  status: string;
  comparisonId: number | null;
}

function DimensionStatusBadge({ dim }: { dim: DimensionEntry }) {
  if (dim.status === 'complete' && dim.comparisonId !== null) {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        Compared
      </Badge>
    );
  }
  if (dim.status === 'complete' && dim.comparisonId === null) {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" />
        Skipped
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

function DimensionRow({ dim, score }: { dim: DimensionEntry; score?: number }) {
  return (
    <div className="flex items-center justify-between text-sm rounded-lg border p-3">
      <span className="font-medium">{dim.name}</span>
      <div className="flex items-center gap-2">
        {score != null && (
          <span className="text-xs text-muted-foreground">{Math.round(score)}</span>
        )}
        <DimensionStatusBadge dim={dim} />
      </div>
    </div>
  );
}

function ResultsErrorView({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="text-center py-12 text-muted-foreground" data-testid="results-error">
      <p className="text-lg mb-2">Could not load debrief results</p>
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/media')}>
        Back to Library
      </Button>
    </div>
  );
}

function ResultsActions({ movieId }: { movieId: number }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-2 pt-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(`/media/movies/${movieId}`)}
        data-testid="back-to-movie-btn"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Movie
      </Button>
      <Button variant="default" size="sm" onClick={() => navigate('/media')} data-testid="done-btn">
        Done
      </Button>
    </div>
  );
}

interface DebriefData {
  movie: { mediaId: number; title: string };
  dimensions: DimensionEntry[];
}

function ResultsBody({
  debrief,
  scoresData,
}: {
  debrief: DebriefData;
  scoresData?: { data: { dimensionId: number; score: number }[] };
}) {
  const compared = debrief.dimensions.filter(
    (d) => d.status === 'complete' && d.comparisonId !== null
  );
  const skipped = debrief.dimensions.filter(
    (d) => d.status === 'complete' && d.comparisonId === null
  );
  const pending = debrief.dimensions.filter((d) => d.status === 'pending');
  const scoreByDimension = new Map((scoresData?.data ?? []).map((s) => [s.dimensionId, s.score]));

  return (
    <CardContent className="space-y-4">
      <div className="space-y-2">
        {debrief.dimensions.map((dim) => (
          <DimensionRow
            key={dim.dimensionId}
            dim={dim}
            score={scoreByDimension.get(dim.dimensionId)}
          />
        ))}
      </div>

      {scoresData?.data && scoresData.data.length > 0 && (
        <CurrentScoresList scores={scoresData.data} dimensions={debrief.dimensions} />
      )}

      <div className="text-muted-foreground border-t pt-3 text-sm">
        {compared.length} compared, {skipped.length} skipped
        {pending.length > 0 ? `, ${pending.length} pending` : ''}
      </div>

      <ResultsActions movieId={debrief.movie.mediaId} />
    </CardContent>
  );
}

export function DebriefResultsSummary({ mediaType, mediaId }: DebriefResultsSummaryProps) {
  const {
    data: debriefData,
    isLoading,
    error,
  } = trpc.media.comparisons.getDebrief.useQuery({ mediaType, mediaId });

  const debrief = debriefData?.data;

  const { data: scoresData } = trpc.media.comparisons.scores.useQuery(
    { mediaType: 'movie', mediaId: debrief?.movie.mediaId ?? 0 },
    { enabled: !!debrief }
  );

  if (isLoading) return <DebriefResultsSummarySkeleton />;
  if (error || !debrief) {
    return <ResultsErrorView message={error?.message ?? 'Session not found'} />;
  }

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
        <ResultsBody debrief={debrief} scoresData={scoresData} />
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
