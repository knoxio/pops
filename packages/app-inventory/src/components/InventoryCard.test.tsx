import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InventoryCard } from "./InventoryCard";

const defaultProps = {
  id: "item-1",
  itemName: "MacBook Pro",
  assetId: "ASSET-001",
  type: "Electronics",
  condition: "Excellent" as const,
};

describe("InventoryCard", () => {
  describe("horizontal layout (default)", () => {
    it("renders item name", () => {
      render(<InventoryCard {...defaultProps} />);
      expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    });

    it("renders asset ID badge", () => {
      render(<InventoryCard {...defaultProps} />);
      expect(screen.getByText("ASSET-001")).toBeInTheDocument();
    });

    it("renders type badge", () => {
      render(<InventoryCard {...defaultProps} />);
      expect(screen.getByText("Electronics")).toBeInTheDocument();
    });

    it("renders condition badge", () => {
      render(<InventoryCard {...defaultProps} />);
      expect(screen.getByText("Excellent")).toBeInTheDocument();
    });

    it("renders brand and model", () => {
      render(<InventoryCard {...defaultProps} brand="Apple" model="M3 Max" />);
      // Brand and model are rendered within the same <p> element separated by a bullet
      expect(screen.getByText(/Apple/)).toBeInTheDocument();
      expect(screen.getByText(/M3 Max/)).toBeInTheDocument();
    });

    it("calls onClick with id when clicked", () => {
      const onClick = vi.fn();
      render(<InventoryCard {...defaultProps} onClick={onClick} />);
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledWith("item-1");
    });

    it("has correct aria-label", () => {
      render(<InventoryCard {...defaultProps} />);
      expect(screen.getByLabelText("MacBook Pro")).toBeInTheDocument();
    });
  });

  describe("vertical layout", () => {
    it("renders item name", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" />);
      expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    });

    it("renders type badge overlay", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" />);
      expect(screen.getByText("Electronics")).toBeInTheDocument();
    });

    it("renders asset ID", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" />);
      expect(screen.getByText("ASSET-001")).toBeInTheDocument();
    });

    it("renders location name", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" locationName="Office > Desk" />);
      expect(screen.getByText("Office > Desk")).toBeInTheDocument();
    });

    it("does not render location when absent", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" />);
      expect(screen.queryByText(/Office/)).not.toBeInTheDocument();
    });

    it("calls onClick with id when clicked", () => {
      const onClick = vi.fn();
      render(<InventoryCard {...defaultProps} layout="vertical" onClick={onClick} />);
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledWith("item-1");
    });
  });

  describe("photo and placeholder", () => {
    it("shows placeholder when no photo URL", () => {
      render(<InventoryCard {...defaultProps} photoUrl={null} />);
      // No img element when placeholder is shown
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("renders photo when URL provided", () => {
      render(<InventoryCard {...defaultProps} photoUrl="/photo.jpg" />);
      const img = screen.getByAltText("MacBook Pro photo");
      expect(img).toHaveAttribute("src", "/photo.jpg");
    });

    it("shows placeholder on image error", () => {
      render(<InventoryCard {...defaultProps} photoUrl="/broken.jpg" />);
      const img = screen.getByAltText("MacBook Pro photo");
      fireEvent.error(img);
      // After error, img should be gone (placeholder shown)
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows placeholder in vertical layout when no photo", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" photoUrl={null} />);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("renders photo in vertical layout", () => {
      render(<InventoryCard {...defaultProps} layout="vertical" photoUrl="/photo.jpg" />);
      const img = screen.getByAltText("MacBook Pro photo");
      expect(img).toHaveAttribute("src", "/photo.jpg");
    });
  });
});
