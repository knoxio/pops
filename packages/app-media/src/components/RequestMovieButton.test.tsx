import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockGetConfigQuery = vi.fn();
const mockGetMovieStatusQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      arr: {
        getConfig: {
          useQuery: () => mockGetConfigQuery(),
        },
        getMovieStatus: {
          useQuery: (_input: unknown, _opts: unknown) => mockGetMovieStatusQuery(),
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

import { RequestMovieButton } from "./RequestMovieButton";
import { toast } from "sonner";

describe("RequestMovieButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows disabled button when Radarr is not configured (standard)", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: false } } });
    mockGetMovieStatusQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" />);

    const button = screen.getByRole("button", { name: /request/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Radarr not configured");
  });

  it("shows disabled compact button when Radarr is not configured", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: false } } });
    mockGetMovieStatusQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" variant="compact" />);

    const button = screen.getByRole("button", { name: /radarr not configured/i });
    expect(button).toBeDisabled();
  });

  it("hides button when movie exists in Radarr (available)", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "available", label: "Available" } },
      isLoading: false,
      error: null,
    });

    const { container } = render(<RequestMovieButton tmdbId={123} title="Test Movie" />);
    expect(container.innerHTML).toBe("");
  });

  it("hides button when movie is monitored in Radarr", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "monitored", label: "Monitored" } },
      isLoading: false,
      error: null,
    });

    const { container } = render(<RequestMovieButton tmdbId={123} title="Test Movie" />);
    expect(container.innerHTML).toBe("");
  });

  it("hides button when movie is downloading in Radarr", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "downloading", label: "Downloading 45%" } },
      isLoading: false,
      error: null,
    });

    const { container } = render(<RequestMovieButton tmdbId={123} title="Test Movie" />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when Radarr is unreachable (query error)", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Connection refused"),
    });

    const { container } = render(<RequestMovieButton tmdbId={123} title="Test Movie" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows Request button when movie is not found in Radarr (standard)", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "not_found", label: "Not in Radarr" } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" />);
    expect(screen.getByRole("button", { name: /request/i })).toBeEnabled();
  });

  it("shows compact button when movie is not found in Radarr", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "not_found", label: "Not in Radarr" } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" variant="compact" />);
    expect(screen.getByRole("button", { name: /request in radarr/i })).toBeEnabled();
  });

  it("calls onRequest callback when clicked", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "not_found", label: "Not in Radarr" } },
      isLoading: false,
      error: null,
    });

    const onRequest = vi.fn();
    render(<RequestMovieButton tmdbId={456} title="Test Movie" onRequest={onRequest} />);

    fireEvent.click(screen.getByRole("button", { name: /request/i }));
    expect(onRequest).toHaveBeenCalledWith(456);
  });

  it("shows toast when clicked without onRequest callback", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: "not_found", label: "Not in Radarr" } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={789} title="Inception" />);

    fireEvent.click(screen.getByRole("button", { name: /request/i }));
    expect(toast.info).toHaveBeenCalledWith('Request "Inception" — modal coming soon');
  });

  it("returns null while loading", () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(<RequestMovieButton tmdbId={123} title="Test Movie" />);
    expect(container.innerHTML).toBe("");
  });
});
