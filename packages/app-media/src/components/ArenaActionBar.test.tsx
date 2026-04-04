import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@pops/ui";
import { ArenaActionBar } from "./ArenaActionBar";

const movieA = { id: 1, title: "The Matrix" };
const movieB = { id: 2, title: "Inception" };

const defaultProps = {
  movieA,
  movieB,
  onSkip: vi.fn(),
  onStale: vi.fn(),
  onNA: vi.fn(),
  onBlacklist: vi.fn(),
  onDone: vi.fn(),
};

describe("ArenaActionBar", () => {
  it("renders all primary buttons", () => {
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} />
      </TooltipProvider>
    );
    expect(screen.getByTestId("skip-button")).toBeInTheDocument();
    expect(screen.getByTestId("stale-a-button")).toBeInTheDocument();
    expect(screen.getByTestId("stale-b-button")).toBeInTheDocument();
    expect(screen.getByTestId("done-button")).toBeInTheDocument();
  });

  it("renders desktop-only secondary actions", () => {
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} />
      </TooltipProvider>
    );
    expect(screen.getByTestId("na-button")).toBeInTheDocument();
    expect(screen.getByTestId("not-watched-a-button")).toBeInTheDocument();
    expect(screen.getByTestId("not-watched-b-button")).toBeInTheDocument();
  });

  it("calls onSkip when skip button clicked", () => {
    const onSkip = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onSkip={onSkip} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("skip-button"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("calls onStale with movie A id", () => {
    const onStale = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onStale={onStale} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("stale-a-button"));
    expect(onStale).toHaveBeenCalledWith(1);
  });

  it("calls onStale with movie B id", () => {
    const onStale = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onStale={onStale} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("stale-b-button"));
    expect(onStale).toHaveBeenCalledWith(2);
  });

  it("calls onNA when N/A button clicked", () => {
    const onNA = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onNA={onNA} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("na-button"));
    expect(onNA).toHaveBeenCalledTimes(1);
  });

  it("calls onBlacklist with movie A when not-watched A clicked", () => {
    const onBlacklist = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onBlacklist={onBlacklist} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("not-watched-a-button"));
    expect(onBlacklist).toHaveBeenCalledWith(movieA);
  });

  it("calls onBlacklist with movie B when not-watched B clicked", () => {
    const onBlacklist = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onBlacklist={onBlacklist} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("not-watched-b-button"));
    expect(onBlacklist).toHaveBeenCalledWith(movieB);
  });

  it("calls onDone when done button clicked", () => {
    const onDone = vi.fn();
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} onDone={onDone} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByTestId("done-button"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("disables skip button when skipPending", () => {
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} skipPending />
      </TooltipProvider>
    );
    expect(screen.getByTestId("skip-button")).toBeDisabled();
    expect(screen.getByTestId("skip-button")).toHaveTextContent("Skipping…");
  });

  it("disables stale buttons when stalePending", () => {
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} stalePending />
      </TooltipProvider>
    );
    expect(screen.getByTestId("stale-a-button")).toBeDisabled();
    expect(screen.getByTestId("stale-b-button")).toBeDisabled();
  });

  it("applies destructive styling to not-watched buttons", () => {
    render(
      <TooltipProvider>
        <ArenaActionBar {...defaultProps} />
      </TooltipProvider>
    );
    const notWatchedA = screen.getByTestId("not-watched-a-button");
    expect(notWatchedA.className).toContain("text-destructive");
  });
});
