import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhotoGallery } from "./PhotoGallery";
import type { PhotoItem } from "./PhotoGallery";

const photos: PhotoItem[] = [
  { id: 1, filePath: "item-1/front.jpg", caption: "Front view", sortOrder: 0 },
  { id: 2, filePath: "item-1/back.jpg", caption: "Back view", sortOrder: 1 },
  { id: 3, filePath: "item-1/side.jpg", caption: null, sortOrder: 2 },
];

describe("PhotoGallery", () => {
  it("renders empty state when no photos", () => {
    render(<PhotoGallery photos={[]} />);
    expect(screen.getByText("No photos yet.")).toBeInTheDocument();
  });

  it("renders thumbnail grid with correct images", () => {
    render(<PhotoGallery photos={photos} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(3);
    expect(imgs[0]).toHaveAttribute("alt", "Front view");
    expect(imgs[2]).toHaveAttribute("alt", "Photo 3");
  });

  it("renders photos sorted by sortOrder", () => {
    const unordered: PhotoItem[] = [
      { id: 3, filePath: "c.jpg", caption: "Third", sortOrder: 2 },
      { id: 1, filePath: "a.jpg", caption: "First", sortOrder: 0 },
    ];
    render(<PhotoGallery photos={unordered} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs[0]).toHaveAttribute("alt", "First");
    expect(imgs[1]).toHaveAttribute("alt", "Third");
  });

  it("opens lightbox on thumbnail click", () => {
    render(<PhotoGallery photos={photos} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("navigates to next photo in lightbox", () => {
    render(<PhotoGallery photos={photos} />);
    // Open lightbox on first photo
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    // Click next
    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("navigates to previous photo in lightbox", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button")[1]); // Open 2nd photo
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Previous photo"));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("closes lightbox with close button", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close lightbox"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes lightbox with Escape key", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates with arrow keys", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button")[0]);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("shows delete button when onDelete is provided", () => {
    const onDelete = vi.fn();
    render(<PhotoGallery photos={photos} onDelete={onDelete} />);
    const deleteButtons = screen.getAllByLabelText(/Delete photo/);
    expect(deleteButtons).toHaveLength(3);
  });

  it("calls onDelete with photo id", () => {
    const onDelete = vi.fn();
    render(<PhotoGallery photos={photos} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Delete photo Front view"));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("does not show delete buttons when onDelete is not provided", () => {
    render(<PhotoGallery photos={photos} />);
    expect(screen.queryByLabelText(/Delete photo/)).not.toBeInTheDocument();
  });

  it("displays caption in lightbox", () => {
    render(<PhotoGallery photos={photos} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("Front view")).toBeInTheDocument();
  });

  it("does not show nav arrows for single photo", () => {
    render(<PhotoGallery photos={[photos[0]]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByLabelText("Next photo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Previous photo")).not.toBeInTheDocument();
  });

  it("uses custom baseUrl", () => {
    render(<PhotoGallery photos={[photos[0]]} baseUrl="/custom" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("/custom/");
  });
});
