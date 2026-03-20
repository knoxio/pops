/**
 * Tests for PageNav helper functions
 */
import { describe, it, expect } from "vitest";
import { findActiveApp, isPageActive } from "./PageNav";
import type { AppNavConfig } from "@/app/nav/types";

const mockApps: AppNavConfig[] = [
  {
    id: "finance",
    label: "Finance",
    icon: "DollarSign",
    basePath: "/finance",
    items: [
      { path: "", label: "Dashboard", icon: "LayoutDashboard" },
      { path: "/transactions", label: "Transactions", icon: "CreditCard" },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: "Film",
    basePath: "/media",
    items: [
      { path: "", label: "Library", icon: "Film" },
      { path: "/watchlist", label: "Watchlist", icon: "Star" },
    ],
  },
];

describe("findActiveApp", () => {
  it("returns the app matching the pathname", () => {
    expect(findActiveApp("/finance/transactions", mockApps)?.id).toBe(
      "finance",
    );
    expect(findActiveApp("/media/watchlist", mockApps)?.id).toBe("media");
  });

  it("matches app root path", () => {
    expect(findActiveApp("/finance", mockApps)?.id).toBe("finance");
    expect(findActiveApp("/finance/", mockApps)?.id).toBe("finance");
  });

  it("returns undefined for unknown paths", () => {
    expect(findActiveApp("/settings", mockApps)).toBeUndefined();
    expect(findActiveApp("/", mockApps)).toBeUndefined();
  });
});

describe("isPageActive", () => {
  it("matches index page on exact basePath", () => {
    expect(isPageActive("/finance", "/finance", "")).toBe(true);
    expect(isPageActive("/finance/", "/finance", "")).toBe(true);
  });

  it("does not match index page on sub-path", () => {
    expect(isPageActive("/finance/transactions", "/finance", "")).toBe(false);
  });

  it("matches sub-page by prefix", () => {
    expect(
      isPageActive("/finance/transactions", "/finance", "/transactions"),
    ).toBe(true);
  });

  it("matches sub-page with deeper path", () => {
    expect(
      isPageActive("/finance/transactions/123", "/finance", "/transactions"),
    ).toBe(true);
  });

  it("does not match unrelated page", () => {
    expect(isPageActive("/finance/budgets", "/finance", "/transactions")).toBe(
      false,
    );
  });
});
