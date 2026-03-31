import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockProfilesQuery = vi.fn();
const mockFoldersQuery = vi.fn();
const mockLanguagesQuery = vi.fn();
const mockAddSeriesMutate = vi.fn();
let addSeriesOpts: Record<string, unknown> = {};

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getSonarrQualityProfiles: {
          useQuery: (...args: unknown[]) => mockProfilesQuery(...args),
        },
        getSonarrRootFolders: {
          useQuery: (...args: unknown[]) => mockFoldersQuery(...args),
        },
        getSonarrLanguageProfiles: {
          useQuery: (...args: unknown[]) => mockLanguagesQuery(...args),
        },
        addSeries: {
          useMutation: (opts: Record<string, unknown>) => {
            addSeriesOpts = opts;
            return { mutate: mockAddSeriesMutate, isPending: false };
          },
        },
      },
    },
  },
}));

import { RequestSeriesModal } from "./RequestSeriesModal";
import type { SeasonInfo } from "./RequestSeriesModal";

// ── Helpers ────────────────────────────────────────────────────────────────

const profiles = [
  { id: 1, name: "HD - 720p/1080p" },
  { id: 2, name: "Ultra-HD" },
];

const folders = [
  { id: 1, path: "/tv", freeSpace: 800 * 1024 * 1024 * 1024 },
  { id: 2, path: "/tv2", freeSpace: 200 * 1024 * 1024 * 1024 },
];

const languageProfiles = [
  { id: 1, name: "English" },
  { id: 2, name: "Any" },
];

const pastSeasons: SeasonInfo[] = [
  { seasonNumber: 1, firstAirDate: "2020-01-15" },
  { seasonNumber: 2, firstAirDate: "2021-03-20" },
];

const futureSeasons: SeasonInfo[] = [
  { seasonNumber: 3, firstAirDate: "2028-06-01" },
  { seasonNumber: 4, firstAirDate: null },
];

const mixedSeasons: SeasonInfo[] = [...pastSeasons, ...futureSeasons];

function setupDefaults(
  overrides: {
    profilesLoading?: boolean;
    foldersLoading?: boolean;
    languagesLoading?: boolean;
    profileList?: typeof profiles;
    folderList?: typeof folders;
    languageList?: typeof languageProfiles;
  } = {}
) {
  const {
    profilesLoading = false,
    foldersLoading = false,
    languagesLoading = false,
    profileList = profiles,
    folderList = folders,
    languageList = languageProfiles,
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
  mockLanguagesQuery.mockReturnValue({
    isLoading: languagesLoading,
    data: languagesLoading ? null : { data: languageList },
    refetch: vi.fn(),
  });
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  tvdbId: 81189,
  title: "Breaking Bad",
  year: 2008,
  seasons: mixedSeasons,
};

function renderModal(props: Partial<typeof defaultProps> = {}) {
  return render(<RequestSeriesModal {...defaultProps} {...props} />);
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  addSeriesOpts = {};
});

describe("RequestSeriesModal", () => {
  it("shows series title and year in header", () => {
    setupDefaults();
    renderModal();

    expect(screen.getByText("Request Series")).toBeInTheDocument();
    expect(screen.getByText("Breaking Bad (2008)")).toBeInTheDocument();
  });

  it("populates quality profile dropdown from API", () => {
    setupDefaults();
    renderModal();

    const select = document.getElementById("quality-profile") as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toBe("HD - 720p/1080p");
    expect(options[1]!.textContent).toBe("Ultra-HD");
  });

  it("populates root folder dropdown with free space", () => {
    setupDefaults();
    renderModal();

    const select = document.getElementById("root-folder") as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain("/tv");
    expect(options[0]!.textContent).toContain("GB free");
  });

  it("populates language profile dropdown from API", () => {
    setupDefaults();
    renderModal();

    const select = document.getElementById("language-profile") as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toBe("English");
    expect(options[1]!.textContent).toBe("Any");
  });

  it("defaults to first quality profile, root folder, and language profile", () => {
    setupDefaults();
    renderModal();

    expect((document.getElementById("quality-profile") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("root-folder") as HTMLSelectElement).value).toBe("/tv");
    expect((document.getElementById("language-profile") as HTMLSelectElement).value).toBe("1");
  });

  it("applies smart season defaults — future checked, past unchecked", () => {
    setupDefaults();
    renderModal();

    const checkboxes = screen.getAllByRole("checkbox");
    // Season 1 (2020) and Season 2 (2021) should be unchecked
    expect(checkboxes[0]).not.toBeChecked(); // Season 1
    expect(checkboxes[1]).not.toBeChecked(); // Season 2
    // Season 3 (2028) and Season 4 (null/unannounced) should be checked
    expect(checkboxes[2]).toBeChecked(); // Season 3
    expect(checkboxes[3]).toBeChecked(); // Season 4
  });

  it("allows toggling individual season checkboxes", () => {
    setupDefaults();
    renderModal();

    const checkboxes = screen.getAllByRole("checkbox");
    // Toggle Season 1 on
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]!).toBeChecked();
    // Toggle Season 3 off
    fireEvent.click(checkboxes[2]!);
    expect(checkboxes[2]!).not.toBeChecked();
  });

  it("shows Select All / Deselect All when more than 3 seasons", () => {
    setupDefaults();
    renderModal();

    expect(screen.getByText("Select All")).toBeInTheDocument();
    expect(screen.getByText("Deselect All")).toBeInTheDocument();
  });

  it("does not show bulk controls when 3 or fewer seasons", () => {
    setupDefaults();
    renderModal({ seasons: pastSeasons });

    expect(screen.queryByText("Select All")).not.toBeInTheDocument();
    expect(screen.queryByText("Deselect All")).not.toBeInTheDocument();
  });

  it("Select All checks all seasons", () => {
    setupDefaults();
    renderModal();

    fireEvent.click(screen.getByText("Select All"));

    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it("Deselect All unchecks all seasons", () => {
    setupDefaults();
    renderModal();

    fireEvent.click(screen.getByText("Deselect All"));

    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) {
      expect(cb).not.toBeChecked();
    }
  });

  it("sends correct addSeries payload on confirm", () => {
    setupDefaults();
    renderModal();

    fireEvent.click(screen.getByText("Request"));

    expect(mockAddSeriesMutate).toHaveBeenCalledWith({
      tvdbId: 81189,
      title: "Breaking Bad",
      qualityProfileId: 1,
      rootFolderPath: "/tv",
      languageProfileId: 1,
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
        { seasonNumber: 3, monitored: true },
        { seasonNumber: 4, monitored: true },
      ],
    });
  });

  it("calls onClose after successful add", () => {
    vi.useFakeTimers();
    setupDefaults();
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("Request"));

    const onSuccess = addSeriesOpts.onSuccess as () => void;
    act(() => onSuccess());

    expect(screen.getByText("Series Added")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));
    expect(onClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("shows inline error on failure", () => {
    setupDefaults();
    renderModal();

    fireEvent.click(screen.getByText("Request"));

    const onError = addSeriesOpts.onError as (err: { message: string }) => void;
    act(() => onError({ message: "Series already exists in Sonarr" }));

    expect(screen.getByText("Series already exists in Sonarr")).toBeInTheDocument();
  });

  it("calls onClose on cancel without API call", () => {
    setupDefaults();
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(mockAddSeriesMutate).not.toHaveBeenCalled();
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

  it("shows retry when no language profiles available", () => {
    setupDefaults({ languageList: [] });
    renderModal();

    expect(screen.getByText(/No language profiles found/)).toBeInTheDocument();
  });

  it("displays season year from firstAirDate", () => {
    setupDefaults();
    renderModal();

    expect(screen.getByText("— 2020")).toBeInTheDocument();
    expect(screen.getByText("— 2028")).toBeInTheDocument();
  });

  it("displays Specials for season 0", () => {
    setupDefaults();
    renderModal({
      seasons: [{ seasonNumber: 0, firstAirDate: "2019-01-01" }],
    });

    expect(screen.getByText("Specials")).toBeInTheDocument();
  });
});
