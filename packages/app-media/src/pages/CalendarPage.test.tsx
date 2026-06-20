import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { arrConfigMock, arrGetCalendarMock } = vi.hoisted(() => ({
  arrConfigMock: vi.fn(),
  arrGetCalendarMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  arrConfig: (...args: unknown[]) => arrConfigMock(...args),
  arrGetCalendar: (...args: unknown[]) => arrGetCalendarMock(...args),
}));

import { CalendarPage } from './CalendarPage';

function ok<T>(data: T) {
  return { data, error: undefined };
}

const makeEpisode = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  seriesId: 10,
  seriesTitle: 'Breaking Bad',
  tvdbId: 81189,
  episodeTitle: 'Pilot',
  seasonNumber: 1,
  episodeNumber: 1,
  airDateUtc: new Date().toISOString(),
  hasFile: false,
  posterUrl: '/poster.jpg',
  ...overrides,
});

function mockConfig(sonarrConfigured: boolean, radarrConfigured = false) {
  arrConfigMock.mockResolvedValue(ok({ data: { radarrConfigured, sonarrConfigured } }));
}

function mockCalendar(episodes: ReturnType<typeof makeEpisode>[]) {
  arrGetCalendarMock.mockResolvedValue(ok({ data: episodes }));
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <MemoryRouter initialEntries={['/media/arr/calendar']}>
      <CalendarPage />
    </MemoryRouter>,
    { wrapper }
  );
}

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows not configured message when Sonarr is not set up', async () => {
    mockConfig(false);
    renderPage();
    expect(await screen.findByText('Sonarr not configured')).toBeInTheDocument();
    expect(screen.getByText(/Arr Settings/)).toBeInTheDocument();
    expect(arrGetCalendarMock).not.toHaveBeenCalled();
  });

  it('shows empty state when no episodes', async () => {
    mockConfig(true);
    mockCalendar([]);
    renderPage();
    expect(await screen.findByText('No upcoming episodes in the next 30 days')).toBeInTheDocument();
  });

  it('shows error message on query failure', async () => {
    mockConfig(true);
    arrGetCalendarMock.mockRejectedValue(new Error('Connection refused'));
    renderPage();
    expect(await screen.findByText('Connection refused')).toBeInTheDocument();
  });

  it('renders episodes grouped by date', async () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    mockConfig(true);
    mockCalendar([
      makeEpisode({ id: 1, seriesTitle: 'Show A', airDateUtc: today.toISOString() }),
      makeEpisode({ id: 2, seriesTitle: 'Show B', airDateUtc: tomorrow.toISOString() }),
    ]);
    renderPage();
    expect(await screen.findByText('Show A')).toBeInTheDocument();
    expect(screen.getByText('Show B')).toBeInTheDocument();
  });

  it('highlights today with badge', async () => {
    mockConfig(true);
    mockCalendar([makeEpisode({ airDateUtc: new Date().toISOString() })]);
    renderPage();
    expect(await screen.findByText('Today')).toBeInTheDocument();
  });

  it('shows Downloaded badge for episodes with files', async () => {
    mockConfig(true);
    mockCalendar([makeEpisode({ hasFile: true })]);
    renderPage();
    expect(await screen.findByText('Downloaded')).toBeInTheDocument();
  });

  it('shows Missing badge for episodes without files', async () => {
    mockConfig(true);
    mockCalendar([makeEpisode({ hasFile: false })]);
    renderPage();
    expect(await screen.findByText('Missing')).toBeInTheDocument();
  });

  it('renders episode code badge (S01E01)', async () => {
    mockConfig(true);
    mockCalendar([makeEpisode({ seasonNumber: 3, episodeNumber: 7 })]);
    renderPage();
    expect(await screen.findByText('S03E07')).toBeInTheDocument();
  });

  it('links episodes to show detail page', async () => {
    mockConfig(true);
    mockCalendar([makeEpisode({ seriesId: 42 })]);
    renderPage();
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/media/tv/42');
  });

  it('sorts episodes within a date group by air time ascending', async () => {
    mockConfig(true);
    const date = '2026-04-10';
    mockCalendar([
      makeEpisode({ id: 2, episodeTitle: 'Late Show', airDateUtc: `${date}T22:00:00Z` }),
      makeEpisode({ id: 1, episodeTitle: 'Morning Show', airDateUtc: `${date}T08:00:00Z` }),
      makeEpisode({ id: 3, episodeTitle: 'Noon Show', airDateUtc: `${date}T12:00:00Z` }),
    ]);
    const { container } = renderPage();
    await screen.findByText('Morning Show');
    const text = container.textContent ?? '';
    expect(text.indexOf('Morning Show')).toBeLessThan(text.indexOf('Noon Show'));
    expect(text.indexOf('Noon Show')).toBeLessThan(text.indexOf('Late Show'));
  });
});
