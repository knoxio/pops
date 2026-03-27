import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockQualityProfiles = vi.fn();
const mockRootFolders = vi.fn();
const mockLanguageProfiles = vi.fn();
const mockMutateAsync = vi.fn();
const mockAddSeries = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getSonarrQualityProfiles: { useQuery: () => mockQualityProfiles() },
        getSonarrRootFolders: { useQuery: () => mockRootFolders() },
        getSonarrLanguageProfiles: { useQuery: () => mockLanguageProfiles() },
        addSeries: {
          useMutation: () => mockAddSeries(),
        },
      },
    },
  },
}));

import { RequestSeriesModal, type SeasonInfo } from "./RequestSeriesModal";

const QUALITY_PROFILES = [
  { id: 1, name: "HD-1080p" },
  { id: 2, name: "Ultra-HD" },
];

const ROOT_FOLDERS = [
  { id: 1, path: "/tv", freeSpace: 500_000_000_000 },
  { id: 2, path: "/tv-anime", freeSpace: 200_000_000_000 },
];

const LANGUAGE_PROFILES = [
  { id: 1, name: "English" },
  { id: 2, name: "Japanese" },
];

const SEASONS: SeasonInfo[] = [
  { seasonNumber: 1, airDate: "2020-01-15" },
  { seasonNumber: 2, airDate: "2021-06-01" },
  { seasonNumber: 3, airDate: "2027-09-01" },
];

function setupMocks(
  overrides: {
    isLoading?: boolean;
    isPending?: boolean;
  } = {}
): void {
  mockQualityProfiles.mockReturnValue({
    data: overrides.isLoading ? undefined : { data: QUALITY_PROFILES },
    isLoading: overrides.isLoading ?? false,
  });
  mockRootFolders.mockReturnValue({
    data: overrides.isLoading ? undefined : { data: ROOT_FOLDERS },
    isLoading: overrides.isLoading ?? false,
  });
  mockLanguageProfiles.mockReturnValue({
    data: overrides.isLoading ? undefined : { data: LANGUAGE_PROFILES },
    isLoading: overrides.isLoading ?? false,
  });
  mockAddSeries.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: overrides.isPending ?? false,
  });
}

function renderModal(seasonOverrides?: SeasonInfo[]): ReturnType<typeof render> {
  return render(
    <RequestSeriesModal
      open={true}
      onClose={vi.fn()}
      tvdbId={12345}
      title="Breaking Bad"
      year={2008}
      seasons={seasonOverrides ?? SEASONS}
    />
  );
}

describe("RequestSeriesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ data: {} });
  });

  it("renders title with year", () => {
    setupMocks();
    renderModal();
    expect(screen.getByText("Request Breaking Bad (2008)")).toBeInTheDocument();
  });

  it("shows loading spinner while data is loading", () => {
    setupMocks({ isLoading: true });
    renderModal();
    expect(screen.queryByText("Quality Profile")).not.toBeInTheDocument();
  });

  it("populates quality profile dropdown", () => {
    setupMocks();
    renderModal();
    expect(screen.getByText("Quality Profile")).toBeInTheDocument();
    const select = screen.getByTestId("quality-profile-select") as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.some((o) => o.textContent === "HD-1080p")).toBe(true);
    expect(options.some((o) => o.textContent === "Ultra-HD")).toBe(true);
  });

  it("populates root folder dropdown with free space", () => {
    setupMocks();
    renderModal();
    const container = screen.getByTestId("root-folder-select");
    const options = Array.from(container.querySelectorAll("option")).map((o) => o.textContent);
    expect(options.some((o) => o?.includes("/tv") && o?.includes("free"))).toBe(true);
  });

  it("populates language profile dropdown", () => {
    setupMocks();
    renderModal();
    const container = screen.getByTestId("language-profile-select");
    const options = Array.from(container.querySelectorAll("option"));
    expect(options.some((o) => o.textContent === "English")).toBe(true);
  });

  it("defaults future seasons to checked and past to unchecked", () => {
    setupMocks();
    renderModal();

    // Season 1 (2020, past) — unchecked
    const s1 = screen.getByRole("checkbox", { name: "Season 1" });
    expect(s1).toHaveAttribute("data-state", "unchecked");

    // Season 2 (2021, past) — unchecked
    const s2 = screen.getByRole("checkbox", { name: "Season 2" });
    expect(s2).toHaveAttribute("data-state", "unchecked");

    // Season 3 (2027, future) — checked
    const s3 = screen.getByRole("checkbox", { name: "Season 3" });
    expect(s3).toHaveAttribute("data-state", "checked");
  });

  it("toggles a season checkbox", () => {
    setupMocks();
    renderModal();

    const s1 = screen.getByRole("checkbox", { name: "Season 1" });
    expect(s1).toHaveAttribute("data-state", "unchecked");

    fireEvent.click(s1);
    expect(s1).toHaveAttribute("data-state", "checked");

    fireEvent.click(s1);
    expect(s1).toHaveAttribute("data-state", "unchecked");
  });

  it("shows Select All / Deselect All when more than 3 seasons", () => {
    setupMocks();
    const manySeasons: SeasonInfo[] = [
      { seasonNumber: 1, airDate: "2018-01-01" },
      { seasonNumber: 2, airDate: "2019-01-01" },
      { seasonNumber: 3, airDate: "2020-01-01" },
      { seasonNumber: 4, airDate: "2027-01-01" },
    ];
    renderModal(manySeasons);

    expect(screen.getByText("Select All")).toBeInTheDocument();
    expect(screen.getByText("Deselect All")).toBeInTheDocument();
  });

  it("does not show Select All / Deselect All for 3 or fewer seasons", () => {
    setupMocks();
    renderModal();

    expect(screen.queryByText("Select All")).not.toBeInTheDocument();
  });

  it("Select All checks all seasons", () => {
    setupMocks();
    const seasons: SeasonInfo[] = [
      { seasonNumber: 1, airDate: "2020-01-01" },
      { seasonNumber: 2, airDate: "2021-01-01" },
      { seasonNumber: 3, airDate: "2022-01-01" },
      { seasonNumber: 4, airDate: "2023-01-01" },
    ];
    renderModal(seasons);

    fireEvent.click(screen.getByText("Select All"));

    for (const s of seasons) {
      expect(screen.getByRole("checkbox", { name: `Season ${s.seasonNumber}` })).toHaveAttribute(
        "data-state",
        "checked"
      );
    }
  });

  it("Deselect All unchecks all seasons", () => {
    setupMocks();
    const seasons: SeasonInfo[] = [
      { seasonNumber: 1, airDate: "2027-01-01" },
      { seasonNumber: 2, airDate: "2027-06-01" },
      { seasonNumber: 3, airDate: "2028-01-01" },
      { seasonNumber: 4, airDate: "2028-06-01" },
    ];
    renderModal(seasons);

    fireEvent.click(screen.getByText("Deselect All"));

    for (const s of seasons) {
      expect(screen.getByRole("checkbox", { name: `Season ${s.seasonNumber}` })).toHaveAttribute(
        "data-state",
        "unchecked"
      );
    }
  });

  it("sends correct payload on Request click", async () => {
    setupMocks();
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /request/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        tvdbId: 12345,
        title: "Breaking Bad",
        qualityProfileId: 1,
        rootFolderPath: "/tv",
        languageProfileId: 1,
        seasons: [
          { seasonNumber: 1, monitored: false },
          { seasonNumber: 2, monitored: false },
          { seasonNumber: 3, monitored: true },
        ],
      });
    });
  });

  it("shows success message after successful request", async () => {
    setupMocks();
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /request/i }));

    await waitFor(() => {
      expect(screen.getByText("Series added successfully!")).toBeInTheDocument();
    });
  });

  it("shows error message on failure", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Sonarr returned 500"));
    setupMocks();
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /request/i }));

    await waitFor(() => {
      expect(screen.getByText("Sonarr returned 500")).toBeInTheDocument();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    setupMocks();
    const onClose = vi.fn();
    render(
      <RequestSeriesModal open={true} onClose={onClose} tvdbId={1} title="Test" seasons={SEASONS} />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Request button during pending state", () => {
    setupMocks({ isPending: true });
    renderModal();

    expect(screen.getByRole("button", { name: /request/i })).toBeDisabled();
  });

  it("displays season air year", () => {
    setupMocks();
    renderModal();
    expect(screen.getByText(/Season 1 — 2020/)).toBeInTheDocument();
  });
});
