/**
 * CalendarPage — upcoming episodes calendar from Sonarr.
 *
 * Fetches 30 days of episodes, groups by air date, renders date headers
 * with today highlighted, episode cards with poster/title/S##E##/status.
 */
import { Alert, AlertDescription, AlertTitle, Badge, Skeleton } from '@pops/ui';
import { Calendar, CheckCircle, Clock, Film } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';

import { trpc } from '../lib/trpc';

function formatEpisodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** Parse a date-only string (YYYY-MM-DD) without UTC midnight rollover. */
function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

function formatDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const date = parseLocalDate(dateStr);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function getDateKey(airDateUtc: string): string {
  const date = new Date(airDateUtc);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function CalendarSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="space-y-2">
            {[1, 2].map((j) => (
              <Skeleton key={j} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarPage() {
  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const config = configData?.data;

  const now = new Date();
  const start = now.toISOString().split('T')[0]!;
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

  const {
    data: calendarData,
    isLoading,
    error,
  } = trpc.media.arr.getCalendar.useQuery(
    { start, end },
    {
      enabled: config?.sonarrConfigured === true,
      refetchOnWindowFocus: true,
    }
  );

  const episodes = calendarData?.data ?? [];

  const grouped = useMemo(() => {
    const groups = new Map<string, (typeof episodes)[number][]>();
    for (const ep of episodes) {
      const key = getDateKey(ep.airDateUtc);
      const existing = groups.get(key);
      if (existing) {
        existing.push(ep);
      } else {
        groups.set(key, [ep]);
      }
    }
    // Sort groups by date, and episodes within each group by air time ascending
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, eps]) =>
          [key, [...eps].sort((a, b) => a.airDateUtc.localeCompare(b.airDateUtc))] as [
            string,
            typeof eps,
          ]
      );
  }, [episodes]);

  // Sonarr not configured
  if (config && !config.sonarrConfigured) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="h-5 w-5" />
          <h1 className="text-xl font-bold">Upcoming Episodes</h1>
        </div>
        <Alert>
          <AlertTitle>Sonarr not configured</AlertTitle>
          <AlertDescription>
            Configure Sonarr in{' '}
            <Link to="/media/arr" className="underline text-primary">
              Arr Settings
            </Link>{' '}
            to see upcoming episodes.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="h-5 w-5" />
        <h1 className="text-xl font-bold">Upcoming Episodes</h1>
        <span className="text-sm text-muted-foreground">Next 30 days</span>
      </div>

      {isLoading && <CalendarSkeleton />}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && grouped.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Calendar className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No upcoming episodes in the next 30 days</p>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([dateKey, eps]) => {
            const today = isToday(dateKey);
            return (
              <section key={dateKey}>
                <h2
                  className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
                    today ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {formatDate(dateKey)}
                  {today && (
                    <Badge variant="default" className="text-2xs">
                      Today
                    </Badge>
                  )}
                </h2>
                <div className="space-y-2">
                  {eps.map((ep) => (
                    <Link
                      key={ep.id}
                      to={`/media/tv/${ep.seriesId}`}
                      className="flex gap-3 rounded-lg border bg-card p-3 text-card-foreground hover:bg-accent transition-colors"
                    >
                      {/* Poster thumbnail */}
                      <div className="w-12 shrink-0 overflow-hidden rounded bg-muted aspect-[2/3]">
                        {ep.posterUrl ? (
                          <img
                            src={ep.posterUrl}
                            alt={ep.seriesTitle}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Film className="h-5 w-5 opacity-40" />
                          </div>
                        )}
                      </div>

                      {/* Episode info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium truncate">{ep.seriesTitle}</h3>
                          <Badge variant="outline" className="shrink-0 text-2xs">
                            {formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {ep.episodeTitle}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {ep.hasFile ? (
                            <Badge
                              variant="secondary"
                              className="gap-0.5 text-2xs bg-success text-success-foreground"
                            >
                              <CheckCircle className="h-2.5 w-2.5" />
                              Downloaded
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-0.5 text-2xs">
                              <Clock className="h-2.5 w-2.5" />
                              Missing
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Air time */}
                      <div className="text-xs text-muted-foreground shrink-0 self-center">
                        {new Date(ep.airDateUtc).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
