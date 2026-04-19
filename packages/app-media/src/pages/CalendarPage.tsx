import { Calendar } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';

import { trpc } from '@pops/api-client';
/**
 * CalendarPage — upcoming episodes calendar from Sonarr.
 */
import { Alert, AlertDescription, AlertTitle, Badge, Skeleton } from '@pops/ui';

import { CalendarEpisodeRow } from './calendar/CalendarEpisodeRow';

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

interface CalendarEpisode {
  id: number;
  seriesId: number;
  seriesTitle: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc: string;
  hasFile: boolean;
  posterUrl: string | null;
}

function useCalendarPageModel() {
  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const config = configData?.data;

  const now = new Date();
  const start = now.toISOString().split('T')[0] ?? '';
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';

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
    const groups = new Map<string, CalendarEpisode[]>();
    for (const ep of episodes) {
      const key = getDateKey(ep.airDateUtc);
      const existing = groups.get(key);
      if (existing) existing.push(ep);
      else groups.set(key, [ep]);
    }
    return Array.from(groups.entries())
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, eps]) =>
          [key, [...eps].toSorted((a, b) => a.airDateUtc.localeCompare(b.airDateUtc))] as [
            string,
            CalendarEpisode[],
          ]
      );
  }, [episodes]);

  return { config, isLoading, error, grouped };
}

function NotConfigured() {
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Calendar className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-sm">No upcoming episodes in the next 30 days</p>
    </div>
  );
}

function DateSection({ dateKey, eps }: { dateKey: string; eps: CalendarEpisode[] }) {
  const today = isToday(dateKey);
  return (
    <section>
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
          <CalendarEpisodeRow key={ep.id} ep={ep} />
        ))}
      </div>
    </section>
  );
}

export function CalendarPage() {
  const { config, isLoading, error, grouped } = useCalendarPageModel();

  if (config && !config.sonarrConfigured) return <NotConfigured />;

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
      {!isLoading && !error && grouped.length === 0 && <EmptyState />}
      {grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([dateKey, eps]) => (
            <DateSection key={dateKey} dateKey={dateKey} eps={eps} />
          ))}
        </div>
      )}
    </div>
  );
}
