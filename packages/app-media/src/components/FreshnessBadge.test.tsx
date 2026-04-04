import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreshnessBadge } from "./FreshnessBadge";

describe("FreshnessBadge", () => {
  it("returns null for null daysSinceWatch", () => {
    const { container } = render(<FreshnessBadge daysSinceWatch={null} staleness={1.0} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows Fresh for 0–30 days", () => {
    render(<FreshnessBadge daysSinceWatch={0} staleness={1.0} />);
    expect(screen.getByText("Fresh")).toBeInTheDocument();

    const { unmount } = render(<FreshnessBadge daysSinceWatch={30} staleness={1.0} />);
    expect(screen.getAllByText("Fresh")).toHaveLength(2);
    unmount();
  });

  it("shows Recent for 31–90 days", () => {
    render(<FreshnessBadge daysSinceWatch={31} staleness={1.0} />);
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("shows Recent at 90 days boundary", () => {
    render(<FreshnessBadge daysSinceWatch={90} staleness={1.0} />);
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("shows Fading for 91–365 days", () => {
    render(<FreshnessBadge daysSinceWatch={91} staleness={1.0} />);
    expect(screen.getByText("Fading")).toBeInTheDocument();
  });

  it("shows Fading at 365 days boundary", () => {
    render(<FreshnessBadge daysSinceWatch={365} staleness={1.0} />);
    expect(screen.getByText("Fading")).toBeInTheDocument();
  });

  it("shows Stale for 365+ days", () => {
    render(<FreshnessBadge daysSinceWatch={366} staleness={1.0} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("shows Stale when staleness < 1.0 regardless of days", () => {
    render(<FreshnessBadge daysSinceWatch={1} staleness={0.5} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("shows Stale when staleness is very low", () => {
    render(<FreshnessBadge daysSinceWatch={0} staleness={0.01} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("renders as a pill-style badge", () => {
    render(<FreshnessBadge daysSinceWatch={10} staleness={1.0} />);
    const badge = screen.getByTestId("freshness-badge");
    expect(badge.className).toContain("rounded-full");
  });
});
