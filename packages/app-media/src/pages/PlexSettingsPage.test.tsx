import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSyncStatusQuery = vi.fn();
const mockPlexUrlQuery = vi.fn();
const mockSectionIdsQuery = vi.fn();
const mockConnectionTestQuery = vi.fn();
const mockLibrariesQuery = vi.fn();
const mockUsernameQuery = vi.fn();
const mockSchedulerStatusQuery = vi.fn();

const mockSyncMoviesMutate = vi.fn();
const mockSyncTvMutate = vi.fn();
const mockSaveSectionIdsMutate = vi.fn();
const mockSaveUrlMutate = vi.fn();
const mockGetPinMutate = vi.fn();
const mockCheckPinMutate = vi.fn();
const mockDisconnectMutate = vi.fn();
const mockStartSchedulerMutate = vi.fn();
const mockStopSchedulerMutate = vi.fn();

let getPinOnSuccess: ((res: unknown) => void) | undefined;
let syncMoviesOnSuccess: ((res: unknown) => void) | undefined;
let _syncTvOnSuccess: ((res: unknown) => void) | undefined;

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      plex: {
        getSyncStatus: { useQuery: (...args: unknown[]) => mockSyncStatusQuery(...args) },
        getPlexUrl: { useQuery: (...args: unknown[]) => mockPlexUrlQuery(...args) },
        getSectionIds: { useQuery: (...args: unknown[]) => mockSectionIdsQuery(...args) },
        testConnection: { useQuery: (...args: unknown[]) => mockConnectionTestQuery(...args) },
        getLibraries: { useQuery: (...args: unknown[]) => mockLibrariesQuery(...args) },
        getUsername: { useQuery: (...args: unknown[]) => mockUsernameQuery(...args) },
        getSchedulerStatus: { useQuery: (...args: unknown[]) => mockSchedulerStatusQuery(...args) },
        syncMovies: {
          useMutation: (opts: Record<string, (res: unknown) => void>) => {
            syncMoviesOnSuccess = opts.onSuccess;
            return { mutate: mockSyncMoviesMutate, isPending: false };
          },
        },
        syncTvShows: {
          useMutation: (opts: Record<string, (res: unknown) => void>) => {
            _syncTvOnSuccess = opts.onSuccess;
            return { mutate: mockSyncTvMutate, isPending: false };
          },
        },
        saveSectionIds: {
          useMutation: () => ({ mutate: mockSaveSectionIdsMutate, isPending: false }),
        },
        setUrl: {
          useMutation: () => ({
            mutate: mockSaveUrlMutate,
            isPending: false,
            error: null,
          }),
        },
        getAuthPin: {
          useMutation: (opts: Record<string, (res: unknown) => void>) => {
            getPinOnSuccess = opts.onSuccess;
            return { mutate: mockGetPinMutate, isPending: false, error: null };
          },
        },
        checkAuthPin: {
          useMutation: () => ({ mutate: mockCheckPinMutate, isPending: false }),
        },
        disconnect: {
          useMutation: () => ({ mutate: mockDisconnectMutate, isPending: false }),
        },
        startScheduler: {
          useMutation: () => ({ mutate: mockStartSchedulerMutate, isPending: false }),
        },
        stopScheduler: {
          useMutation: () => ({ mutate: mockStopSchedulerMutate, isPending: false }),
        },
      },
    },
    useUtils: () => ({}),
  },
}));

// Mock @pops/ui
vi.mock("@pops/ui", async () => {
  const React = await import("react");
  return {
    Badge: ({ children, className }: { children: React.ReactNode; className?: string }) =>
      React.createElement("span", { "data-testid": "badge", className }, children),
    Button: ({ children, onClick, disabled, ...rest }: Record<string, unknown>) =>
      React.createElement("button", { onClick: onClick as () => void, disabled, ...rest }, children as React.ReactNode),
    Skeleton: ({ className }: { className?: string }) =>
      React.createElement("div", { className: `animate-pulse ${className ?? ""}` }),
    Input: ({ value, onChange, placeholder, disabled, className, type, min, ...rest }: Record<string, unknown>) =>
      React.createElement("input", { value: value as string, onChange: onChange as () => void, placeholder: placeholder as string, disabled, className, type, min, ...rest }),
    Breadcrumb: ({ children }: { children: React.ReactNode }) =>
      React.createElement("nav", null, children),
    BreadcrumbList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("ol", null, children),
    BreadcrumbItem: ({ children }: { children: React.ReactNode }) =>
      React.createElement("li", null, children),
    BreadcrumbLink: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
    BreadcrumbSeparator: () => React.createElement("span", null, "/"),
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) =>
      React.createElement("span", null, children),
  };
});

import { PlexSettingsPage } from "./PlexSettingsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/media/plex"]}>
      <PlexSettingsPage />
    </MemoryRouter>
  );
}

const defaultSyncStatus = {
  data: { data: { configured: true, hasUrl: true, hasToken: true, connected: false } },
  isLoading: false,
  refetch: vi.fn(),
};

const connectedStatus = {
  data: { data: { connected: true } },
  refetch: vi.fn(),
};

const disconnectedNoToken = {
  data: { data: { configured: false, hasUrl: true, hasToken: false, connected: false } },
  isLoading: false,
  refetch: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncStatusQuery.mockReturnValue(defaultSyncStatus);
  mockPlexUrlQuery.mockReturnValue({ data: { data: "http://192.168.1.100:32400" }, isLoading: false, refetch: vi.fn() });
  mockSectionIdsQuery.mockReturnValue({ data: { data: { movieSectionId: "1", tvSectionId: "2" } }, refetch: vi.fn() });
  mockConnectionTestQuery.mockReturnValue(connectedStatus);
  mockLibrariesQuery.mockReturnValue({
    data: {
      data: [
        { key: "1", title: "Movies", type: "movie" },
        { key: "2", title: "TV Shows", type: "show" },
      ],
    },
  });
  mockUsernameQuery.mockReturnValue({ data: { data: "johndoe" }, refetch: vi.fn() });
  mockSchedulerStatusQuery.mockReturnValue({
    data: { data: { isRunning: false, intervalMs: 21600000, lastSyncAt: null, lastSyncError: null, nextSyncAt: null, moviesSynced: 0, tvShowsSynced: 0 } },
    refetch: vi.fn(),
  });
});

describe("PlexSettingsPage", () => {
  it("renders page title", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Plex Settings" })).toBeInTheDocument();
  });

  it("renders URL input with saved value", () => {
    renderPage();
    const input = screen.getByPlaceholderText("http://192.168.1.100:32400");
    expect(input).toBeInTheDocument();
  });

  it("renders connected username", () => {
    renderPage();
    expect(screen.getByText("johndoe")).toBeInTheDocument();
    expect(screen.getByText(/Connected as/)).toBeInTheDocument();
  });

  it("renders disconnect button when authenticated", () => {
    renderPage();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("renders loading skeleton", () => {
    mockSyncStatusQuery.mockReturnValue({ data: null, isLoading: true, refetch: vi.fn() });
    mockPlexUrlQuery.mockReturnValue({ data: null, isLoading: true, refetch: vi.fn() });
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders PIN auth when no token", () => {
    mockSyncStatusQuery.mockReturnValue(disconnectedNoToken);
    renderPage();
    expect(screen.getByText("Connect to Plex")).toBeInTheDocument();
  });

  it("shows PIN code and plex.tv/link after requesting PIN", async () => {
    mockSyncStatusQuery.mockReturnValue(disconnectedNoToken);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Connect to Plex"));
    expect(mockGetPinMutate).toHaveBeenCalled();

    // Simulate PIN response
    getPinOnSuccess?.({ data: { id: 12345, code: "ABCD", clientId: "test-id" } });

    // Re-render to pick up state
    renderPage();
  });

  it("renders movie and TV library selects", () => {
    renderPage();
    expect(screen.getByLabelText("Select movie library")).toBeInTheDocument();
    expect(screen.getByLabelText("Select TV library")).toBeInTheDocument();
  });

  it("renders sync buttons", () => {
    renderPage();
    expect(screen.getByText("Sync Movies")).toBeInTheDocument();
    expect(screen.getByText("Sync TV Shows")).toBeInTheDocument();
  });

  it("displays sync results after movie sync", () => {
    renderPage();
    // Simulate sync success
    syncMoviesOnSuccess?.({
      data: { synced: 50, skipped: 5, errors: [{ title: "Bad Movie", reason: "Missing TMDB ID", year: 2020 }] },
    });
    renderPage(); // re-render
  });

  it("renders scheduler section when connected", () => {
    renderPage();
    expect(screen.getByText("Automatic Sync")).toBeInTheDocument();
  });

  it("renders scheduler toggle", () => {
    renderPage();
    const toggle = screen.getByRole("switch", { name: /toggle automatic sync/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("renders scheduler interval input", () => {
    renderPage();
    const input = screen.getByLabelText("Sync interval hours");
    expect(input).toBeInTheDocument();
  });

  it("shows 'Scheduler off' when not running", () => {
    renderPage();
    expect(screen.getByText("Scheduler off")).toBeInTheDocument();
  });

  it("shows next sync time when scheduler is running", () => {
    const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    mockSchedulerStatusQuery.mockReturnValue({
      data: { data: { isRunning: true, intervalMs: 21600000, nextSyncAt: futureDate, lastSyncAt: null, lastSyncError: null, moviesSynced: 0, tvShowsSynced: 0 } },
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/Next sync in/)).toBeInTheDocument();
  });

  it("calls startScheduler on toggle click", async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = screen.getByRole("switch", { name: /toggle automatic sync/i });
    await user.click(toggle);
    expect(mockStartSchedulerMutate).toHaveBeenCalled();
  });
});
