import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockGetConfigQuery = vi.fn();
const mockGetCalendarQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getConfig: {
          useQuery: () => mockGetConfigQuery(),
        },
        getCalendar: {
          useQuery: (_input: unknown, _opts: unknown) => mockGetCalendarQuery(),
        },
      },
    },
  },
}));

import { CalendarPage } from "./CalendarPage";

const makeEpisode = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  seriesId: 10,
  seriesTitle: "Breaking Bad",
  tvdbId: 81189,
  episodeTitle: "Pilot",
  seasonNumber: 1,
  episodeNumber: 1,
  airDateUtc: new Date().toISOString(),
  hasFile: false,
  posterUrl: "/poster.jpg",
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/media/arr/calendar"]}>
      <CalendarPage />
    </MemoryRouter>
  );
}

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows not configured message when Sonarr is not set up", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: false } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("Sonarr not configured")).toBeInTheDocument();
    expect(screen.getByText(/Arr Settings/)).toBeInTheDocument();
  });

  it("shows loading skeleton when fetching", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderPage();
    expect(screen.getByText("Upcoming Episodes")).toBeInTheDocument();
  });

  it("shows empty state when no episodes", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("No upcoming episodes in the next 30 days")).toBeInTheDocument();
  });

  it("shows error message on query failure", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: "Connection refused" },
    });

    renderPage();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("renders episodes grouped by date", () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [
          makeEpisode({ id: 1, seriesTitle: "Show A", airDateUtc: today.toISOString() }),
          makeEpisode({ id: 2, seriesTitle: "Show B", airDateUtc: tomorrow.toISOString() }),
        ],
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("Show A")).toBeInTheDocument();
    expect(screen.getByText("Show B")).toBeInTheDocument();
  });

  it("highlights today with badge", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [makeEpisode({ airDateUtc: new Date().toISOString() })],
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows Downloaded badge for episodes with files", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [makeEpisode({ hasFile: true })],
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
  });

  it("shows Missing badge for episodes without files", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [makeEpisode({ hasFile: false })],
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("renders episode code badge (S01E01)", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [makeEpisode({ seasonNumber: 3, episodeNumber: 7 })],
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    expect(screen.getByText("S03E07")).toBeInTheDocument();
  });

  it("links episodes to show detail page", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [makeEpisode({ seriesId: 42 })],
      },
      isLoading: false,
      error: null,
    });

    renderPage();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/media/tv/42");
  });

  it("sorts episodes within a date group by air time ascending", () => {
    mockGetConfigQuery.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: true } },
    });
    const date = "2026-04-10";
    mockGetCalendarQuery.mockReturnValue({
      data: {
        data: [
          makeEpisode({ id: 2, episodeTitle: "Late Show", airDateUtc: `${date}T22:00:00Z` }),
          makeEpisode({ id: 1, episodeTitle: "Morning Show", airDateUtc: `${date}T08:00:00Z` }),
          makeEpisode({ id: 3, episodeTitle: "Noon Show", airDateUtc: `${date}T12:00:00Z` }),
        ],
      },
      isLoading: false,
      error: null,
    });

    const { container } = renderPage();
    const text = container.textContent ?? "";
    expect(text.indexOf("Morning Show")).toBeLessThan(text.indexOf("Noon Show"));
    expect(text.indexOf("Noon Show")).toBeLessThan(text.indexOf("Late Show"));
  });
});
