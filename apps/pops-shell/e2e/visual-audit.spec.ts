/**
 * Visual audit — capture full-page screenshots of every main route.
 *
 * Uses the real API with the seeded 'e2e' environment so pages render
 * with actual data. Screenshots are saved to e2e/screenshots/ for
 * manual inspection of broken layouts.
 *
 * Run with:  pnpm test:e2e -- visual-audit.spec.ts
 */
import { test, expect } from "@playwright/test";
import { useRealApi } from "./helpers/use-real-api";

const ROUTES = [
  { name: "dashboard", path: "/finance" },
  { name: "transactions", path: "/finance/transactions" },
  { name: "entities", path: "/finance/entities" },
  { name: "budgets", path: "/finance/budgets" },
  { name: "inventory", path: "/finance/inventory" },
  { name: "wishlist", path: "/finance/wishlist" },
  { name: "import", path: "/finance/import" },
  { name: "ai-usage", path: "/finance/ai-usage" },
] as const;

test.describe("Visual Audit", () => {
  test.beforeEach(async ({ page }) => {
    await useRealApi(page);
  });

  for (const route of ROUTES) {
    test(`screenshot: ${route.name} (${route.path})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await page.goto(route.path, { waitUntil: "networkidle" });

      // Wait for lazy-loaded content and tRPC queries to resolve.
      // Some pages load data via tRPC after initial render — networkidle
      // may fire before queries complete.
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: `e2e/screenshots/${route.name}.png`,
        fullPage: true,
      });

      // Flag console errors (filter React dev warnings)
      const realErrors = consoleErrors.filter(
        (e) => !e.includes("React Router") && !e.includes("Download the React DevTools"),
      );
      if (realErrors.length > 0) {
        console.warn(
          `Console errors on ${route.path}:\n${realErrors.join("\n")}`,
        );
      }
    });
  }
});
