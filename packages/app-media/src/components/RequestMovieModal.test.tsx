import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockProfilesQuery = vi.fn();
const mockFoldersQuery = vi.fn();
const mockAddMovieMutate = vi.fn();
let addMovieOpts: Record<string, unknown> = {};

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getQualityProfiles: {
          useQuery: (...args: unknown[]) => mockProfilesQuery(...args),
        },
        getRootFolders: {
          useQuery: (...args: unknown[]) => mockFoldersQuery(...args),
        },
        addMovie: {
          useMutation: (opts: Record<string, unknown>) => {
            addMovieOpts = opts;
            return { mutate: mockAddMovieMutate, isPending: false };
          },
        },
      },
    },
  },
}));

import { RequestMovieModal } from "./RequestMovieModal";

// ── Helpers ────────────────────────────────────────────────────────────────

const profiles = [
  { id: 1, name: "HD - 720p/1080p" },
  { id: 2, name: "Ultra-HD" },
];

const folders = [
  { id: 1, path: "/movies", freeSpace: 500 * 1024 * 1024 * 1024 },
  { id: 2, path: "/movies2", freeSpace: 100 * 1024 * 1024 * 1024 },
];

function setupDefaults(overrides: {
  profilesLoading?: boolean;
  foldersLoading?: boolean;
  profileList?: typeof profiles;
  folderList?: typeof folders;
} = {}) {
  const {
    profilesLoading = false,
    foldersLoading = false,
    profileList = profiles,
    folderList = folders,
  } = overrides;

  mockProfilesQuery.mockReturnValue({
    isLoading: profilesLoading,
    data: profilesLoading ? null : { data: profileList },
    refetch: vi.fn(),
  });
  mockFoldersQuery.mockReturnValue({
    isLoading: foldersLoading,
    data: foldersLoading ? null : { data: folderList },
    refetch: vi.fn(),
  });
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  tmdbId: 550,
  title: "Fight Club",
  year: 1999,
};

function renderModal(props = {}) {
  return render(<RequestMovieModal {...defaultProps} {...props} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  addMovieOpts = {};
});

describe("RequestMovieModal", () => {
  it("shows movie title and year in header", () => {
    setupDefaults();
    renderModal();

    expect(screen.getByText("Request Movie")).toBeInTheDocument();
    expect(screen.getByText("Fight Club (1999)")).toBeInTheDocument();
  });

  it("populates quality profile dropdown from API", () => {
    setupDefaults();
    renderModal();

    const select = screen.getByLabelText("Quality Profile") as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe("HD - 720p/1080p");
    expect(options[1].textContent).toBe("Ultra-HD");
  });

  it("populates root folder dropdown with free space", () => {
    setupDefaults();
    renderModal();

    const select = screen.getByLabelText("Root Folder") as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain("/movies");
    expect(options[0].textContent).toContain("GB free");
  });

  it("sends correct addMovie payload on confirm", () => {
    setupDefaults();
    renderModal();

    fireEvent.click(screen.getByText("Request"));

    expect(mockAddMovieMutate).toHaveBeenCalledWith({
      tmdbId: 550,
      title: "Fight Club",
      year: 1999,
      qualityProfileId: 1,
      rootFolderPath: "/movies",
    });
  });

  it("calls onClose after successful add", () => {
    vi.useFakeTimers();
    setupDefaults();
    const onClose = vi.fn();
    renderModal({ onClose });

    // Click request
    fireEvent.click(screen.getByText("Request"));

    // Simulate success callback
    const onSuccess = addMovieOpts.onSuccess as () => void;
    onSuccess();

    expect(screen.getByText("Movie Added")).toBeInTheDocument();

    vi.advanceTimersByTime(1500);
    expect(onClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("shows inline error on failure", () => {
    setupDefaults();
    renderModal();

    fireEvent.click(screen.getByText("Request"));

    const onError = addMovieOpts.onError as (err: { message: string }) => void;
    onError({ message: "Movie already exists in Radarr" });

    expect(screen.getByText("Movie already exists in Radarr")).toBeInTheDocument();
  });

  it("calls onClose on cancel without API call", () => {
    setupDefaults();
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(mockAddMovieMutate).not.toHaveBeenCalled();
  });

  it("shows loading state while fetching options", () => {
    setupDefaults({ profilesLoading: true });
    renderModal();

    expect(screen.getByText("Loading options...")).toBeInTheDocument();
  });

  it("shows retry when no profiles available", () => {
    setupDefaults({ profileList: [] });
    renderModal();

    expect(screen.getByText(/No quality profiles found/)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows retry when no root folders available", () => {
    setupDefaults({ folderList: [] });
    renderModal();

    expect(screen.getByText(/No root folders found/)).toBeInTheDocument();
  });

  it("defaults to first quality profile and root folder", () => {
    setupDefaults();
    renderModal();

    const profileSelect = screen.getByLabelText("Quality Profile") as HTMLSelectElement;
    expect(profileSelect.value).toBe("1");

    const folderSelect = screen.getByLabelText("Root Folder") as HTMLSelectElement;
    expect(folderSelect.value).toBe("/movies");
  });
});
