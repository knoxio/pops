/**
 * Media app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-media and mounts them under /media/*.
 */
import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { RouteObject } from 'react-router';

import type { IconName } from '@pops/navigation';

const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const MovieDetailPage = lazy(() =>
  import('./pages/MovieDetailPage').then((m) => ({
    default: m.MovieDetailPage,
  }))
);
const TvShowDetailPage = lazy(() =>
  import('./pages/TvShowDetailPage').then((m) => ({
    default: m.TvShowDetailPage,
  }))
);
const SeasonDetailPage = lazy(() =>
  import('./pages/SeasonDetailPage').then((m) => ({
    default: m.SeasonDetailPage,
  }))
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const WatchlistPage = lazy(() =>
  import('./pages/WatchlistPage').then((m) => ({
    default: m.WatchlistPage,
  }))
);
const QuickPickPage = lazy(() =>
  import('./pages/QuickPickPage').then((m) => ({
    default: m.QuickPickPage,
  }))
);
const CompareArenaPage = lazy(() =>
  import('./pages/CompareArenaPage').then((m) => ({
    default: m.CompareArenaPage,
  }))
);
const DiscoverPage = lazy(() =>
  import('./pages/DiscoverPage').then((m) => ({
    default: m.DiscoverPage,
  }))
);
const RankingsPage = lazy(() =>
  import('./pages/RankingsPage').then((m) => ({
    default: m.RankingsPage,
  }))
);
const RotationLogPage = lazy(() =>
  import('./pages/RotationLogPage').then((m) => ({
    default: m.RotationLogPage,
  }))
);
const CandidateQueuePage = lazy(() =>
  import('./pages/CandidateQueuePage').then((m) => ({
    default: m.CandidateQueuePage,
  }))
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({
    default: m.HistoryPage,
  }))
);
const ComparisonHistoryPage = lazy(() =>
  import('./pages/ComparisonHistoryPage').then((m) => ({
    default: m.ComparisonHistoryPage,
  }))
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({
    default: m.CalendarPage,
  }))
);
const TierListPage = lazy(() =>
  import('./pages/TierListPage').then((m) => ({
    default: m.TierListPage,
  }))
);
const DebriefPage = lazy(() =>
  import('./pages/DebriefPage').then((m) => ({
    default: m.DebriefPage,
  }))
);
const DebriefResultsPage = lazy(() =>
  import('./pages/DebriefResultsPage').then((m) => ({
    default: m.DebriefResultsPage,
  }))
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  labelKey: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; labelKey: string; icon: IconName }[];
}

export const navConfig = {
  id: 'media',
  label: 'Media',
  labelKey: 'media',
  icon: 'Film',
  color: 'indigo',
  basePath: '/media',
  items: [
    { path: '', label: 'Library', labelKey: 'media.library', icon: 'Library' },
    { path: '/watchlist', label: 'Watchlist', labelKey: 'media.watchlist', icon: 'Bookmark' },
    { path: '/history', label: 'History', labelKey: 'media.history', icon: 'Clock' },
    { path: '/discover', label: 'Discover', labelKey: 'media.discover', icon: 'Compass' },
    { path: '/rankings', label: 'Rankings', labelKey: 'media.rankings', icon: 'Trophy' },
    { path: '/search', label: 'Search', labelKey: 'media.search', icon: 'Search' },
    { path: '/compare', label: 'Compare', labelKey: 'media.compare', icon: 'ArrowLeftRight' },
    { path: '/tier-list', label: 'Tier List', labelKey: 'media.tierList', icon: 'Layers' },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <LibraryPage /> },
  { path: 'movies/:id', element: <MovieDetailPage /> },
  { path: 'tv/:id', element: <TvShowDetailPage /> },
  { path: 'tv/:id/season/:num', element: <SeasonDetailPage /> },
  { path: 'watchlist', element: <WatchlistPage /> },
  { path: 'history', element: <HistoryPage /> },
  { path: 'discover', element: <DiscoverPage /> },
  { path: 'rankings', element: <RankingsPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'compare', element: <CompareArenaPage /> },
  { path: 'compare/history', element: <ComparisonHistoryPage /> },
  { path: 'quick-pick', element: <QuickPickPage /> },
  { path: 'plex', element: <Navigate to="/settings#media.plex" replace /> },
  { path: 'arr', element: <Navigate to="/settings#media.arr" replace /> },
  { path: 'rotation', element: <Navigate to="/settings#media.rotation" replace /> },
  { path: 'rotation/log', element: <RotationLogPage /> },
  { path: 'rotation/candidates', element: <CandidateQueuePage /> },
  { path: 'arr/calendar', element: <CalendarPage /> },
  { path: 'calendar', element: <Navigate to="/media/discover" replace /> },
  { path: 'tier-list', element: <TierListPage /> },
  { path: 'debrief/:movieId', element: <DebriefPage /> },
  { path: 'debrief/:movieId/results', element: <DebriefResultsPage /> },
];
