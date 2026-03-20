/**
 * Tests for UI store — sidebar and rail state
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: true, railOpen: true });
  });

  describe("sidebarOpen", () => {
    it("should default to true", () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it("should toggle sidebar", () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it("should set sidebar open directly", () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe("railOpen", () => {
    it("should default to true", () => {
      expect(useUIStore.getState().railOpen).toBe(true);
    });

    it("should toggle rail", () => {
      useUIStore.getState().toggleRail();
      expect(useUIStore.getState().railOpen).toBe(false);

      useUIStore.getState().toggleRail();
      expect(useUIStore.getState().railOpen).toBe(true);
    });

    it("should set rail open directly", () => {
      useUIStore.getState().setRailOpen(false);
      expect(useUIStore.getState().railOpen).toBe(false);

      useUIStore.getState().setRailOpen(true);
      expect(useUIStore.getState().railOpen).toBe(true);
    });
  });

  it("sidebar and rail states are independent", () => {
    useUIStore.getState().setSidebarOpen(false);
    expect(useUIStore.getState().railOpen).toBe(true);

    useUIStore.getState().setRailOpen(false);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    expect(useUIStore.getState().railOpen).toBe(false);
  });
});
