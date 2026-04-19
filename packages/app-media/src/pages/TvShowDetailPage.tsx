import { Link, useParams } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { TvShowDetailContent } from './tv-show-detail/TvShowDetailContent';
import { TvShowDetailSkeleton } from './tv-show-detail/TvShowDetailSkeleton';
import { TvShowHero } from './tv-show-detail/TvShowHero';
import { useTvShowDetailModel } from './tv-show-detail/useTvShowDetailModel';

function InvalidIdView() {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>Invalid show ID</AlertTitle>
        <AlertDescription>The show ID must be a number.</AlertDescription>
      </Alert>
    </div>
  );
}

function ErrorView({ error }: { error: { data?: { code?: string } | null; message: string } }) {
  const is404 = error.data?.code === 'NOT_FOUND';
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>{is404 ? 'Show not found' : 'Error'}</AlertTitle>
        <AlertDescription>
          {is404 ? "This TV show doesn't exist in your library." : error.message}
        </AlertDescription>
      </Alert>
      <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
        Back to library
      </Link>
    </div>
  );
}

export function TvShowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const showId = Number(id);
  const m = useTvShowDetailModel(showId);

  if (Number.isNaN(showId)) return <InvalidIdView />;
  if (m.isLoading) return <TvShowDetailSkeleton />;
  if (m.error) return <ErrorView error={m.error} />;

  const show = m.show;
  if (!show) return null;

  const handleMonitorChange = (seasonNumber: number, checked: boolean, sonarrId: number) => {
    m.setOptimisticMonitoring((prev) => {
      const next = new Map(prev);
      next.set(seasonNumber, checked);
      return next;
    });
    m.setPendingSeasons((prev) => {
      const next = new Set(prev);
      next.add(seasonNumber);
      return next;
    });
    m.seasonMonitorMutation.mutate({ sonarrId, seasonNumber, monitored: checked });
  };

  return (
    <div>
      <TvShowHero
        show={show}
        progress={m.progress}
        showId={showId}
        onBatchLog={() => m.batchLogMutation.mutate({ mediaType: 'show', mediaId: showId })}
        isPending={m.batchLogMutation.isPending}
      />
      <TvShowDetailContent
        show={show}
        seasons={m.seasons}
        progress={m.progress}
        sonarrSeries={m.sonarrSeries}
        optimisticMonitoring={m.optimisticMonitoring}
        pendingSeasons={m.pendingSeasons}
        onMonitorChange={handleMonitorChange}
      />
    </div>
  );
}
