import { Badge } from '@pops/ui';

import { SeasonsList } from './SeasonsList';

import type { ProgressData, SeasonRow, SonarrSeriesData } from './types';

interface TvShowDetailContentProps {
  show: {
    id: number;
    overview: string | null;
    genres: string[] | null;
    status: string | null;
    originalLanguage: string | null;
    networks: string[] | null;
    voteAverage: number | null;
    voteCount: number | null;
  };
  seasons: SeasonRow[];
  progress: ProgressData | undefined;
  sonarrSeries: SonarrSeriesData | undefined;
  optimisticMonitoring: Map<number, boolean>;
  pendingSeasons: Set<number>;
  onMonitorChange: (seasonNumber: number, checked: boolean, sonarrId: number) => void;
}

function buildMetadata(show: TvShowDetailContentProps['show'], seasonCount: number) {
  return [
    { label: 'Status', value: show.status },
    { label: 'Language', value: show.originalLanguage?.toUpperCase() ?? null },
    {
      label: 'Networks',
      value: show.networks && show.networks.length > 0 ? show.networks.join(', ') : null,
    },
    {
      label: 'TMDB Rating',
      value: show.voteAverage ? `${show.voteAverage.toFixed(1)} (${show.voteCount} votes)` : null,
    },
    { label: 'Seasons', value: seasonCount > 0 ? `${seasonCount}` : null },
  ].filter((item) => item.value != null);
}

function GenreSection({ genres }: { genres: string[] | null }) {
  if (!genres || genres.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Genres</h2>
      <div className="flex flex-wrap gap-2">
        {genres.map((genre) => (
          <Badge key={genre} variant="secondary">
            {genre}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function MetadataSection({ items }: { items: { label: string; value: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Details</h2>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TvShowDetailContent(props: TvShowDetailContentProps) {
  const { show, seasons } = props;
  const metadataItems = buildMetadata(show, seasons.length);
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {show.overview && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">{show.overview}</p>
        </section>
      )}
      <GenreSection genres={show.genres} />
      <MetadataSection items={metadataItems} />
      <section>
        <h2 className="text-lg font-semibold mb-3">Seasons</h2>
        <SeasonsList
          showId={show.id}
          seasons={seasons}
          progress={props.progress}
          sonarrSeries={props.sonarrSeries}
          optimisticMonitoring={props.optimisticMonitoring}
          pendingSeasons={props.pendingSeasons}
          onMonitorChange={props.onMonitorChange}
        />
      </section>
    </div>
  );
}
