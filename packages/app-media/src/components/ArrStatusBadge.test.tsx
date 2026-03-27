import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArrStatusBadge } from "./ArrStatusBadge";

const mockGetConfig = vi.fn();
const mockGetMovieStatus = vi.fn();
const mockGetShowStatus = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getConfig: { useQuery: () => mockGetConfig() },
        getMovieStatus: {
          useQuery: (_input: unknown, opts: { enabled: boolean }) =>
            opts.enabled ? mockGetMovieStatus() : { data: null, isLoading: false, error: null },
        },
        getShowStatus: {
          useQuery: (_input: unknown, opts: { enabled: boolean }) =>
            opts.enabled ? mockGetShowStatus() : { data: null, isLoading: false, error: null },
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockReturnValue({
    data: { data: { radarrConfigured: true, sonarrConfigured: true } },
  });
});

describe("ArrStatusBadge", () => {
  it("renders nothing when service is not configured", () => {
    mockGetConfig.mockReturnValue({
      data: { data: { radarrConfigured: false, sonarrConfigured: false } },
    });
    const { container } = render(<ArrStatusBadge kind="movie" externalId={123} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when service is unreachable (error)", () => {
    mockGetMovieStatus.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Connection refused"),
    });
    const { container } = render(<ArrStatusBadge kind="movie" externalId={123} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while loading", () => {
    mockGetMovieStatus.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });
    const { container } = render(<ArrStatusBadge kind="movie" externalId={123} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders Available badge with green styling", () => {
    mockGetMovieStatus.mockReturnValue({
      data: { data: { status: "available", label: "Available" } },
      isLoading: false,
      error: null,
    });
    render(<ArrStatusBadge kind="movie" externalId={123} />);
    const badge = screen.getByText("Available");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-green-600");
  });

  it("renders Downloading badge with yellow styling", () => {
    mockGetMovieStatus.mockReturnValue({
      data: { data: { status: "downloading", label: "Downloading" } },
      isLoading: false,
      error: null,
    });
    render(<ArrStatusBadge kind="movie" externalId={123} />);
    const badge = screen.getByText("Downloading");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-yellow-600");
  });

  it("renders Monitored badge with blue styling", () => {
    mockGetMovieStatus.mockReturnValue({
      data: { data: { status: "monitored", label: "Monitored" } },
      isLoading: false,
      error: null,
    });
    render(<ArrStatusBadge kind="movie" externalId={123} />);
    const badge = screen.getByText("Monitored");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-blue-600");
  });

  it("renders Not Monitored badge with grey styling", () => {
    mockGetMovieStatus.mockReturnValue({
      data: { data: { status: "unmonitored", label: "Not Monitored" } },
      isLoading: false,
      error: null,
    });
    render(<ArrStatusBadge kind="movie" externalId={123} />);
    const badge = screen.getByText("Not Monitored");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-muted");
  });

  it("works for TV shows using sonarr", () => {
    mockGetShowStatus.mockReturnValue({
      data: { data: { status: "monitored", label: "Monitored" } },
      isLoading: false,
      error: null,
    });
    render(<ArrStatusBadge kind="show" externalId={456} />);
    const badge = screen.getByText("Monitored");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-blue-600");
  });
});
