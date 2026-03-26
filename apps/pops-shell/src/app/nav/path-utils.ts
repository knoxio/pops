/**
 * Shared path-matching utilities for navigation components.
 *
 * All nav components (AppRail, PageNav, Sidebar) must use these helpers
 * to avoid prefix-collision bugs (e.g. /fin matching /finance).
 */
import type { AppNavConfig } from "./types.js";

/** Check if pathname matches a prefix at a path-segment boundary. */
export function matchesAtBoundary(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  return pathname.length === prefix.length || pathname[prefix.length] === "/";
}

/** Find the active app by matching the current pathname against registered base paths. */
export function findActiveApp(pathname: string, apps: AppNavConfig[]): AppNavConfig | undefined {
  return apps.find((app) => matchesAtBoundary(pathname, app.basePath));
}

/** Check if a page item is active given the current pathname and its app's basePath. */
export function isPageActive(pathname: string, basePath: string, itemPath: string): boolean {
  if (itemPath === "") {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  const fullPath = `${basePath}${itemPath}`;
  return matchesAtBoundary(pathname, fullPath);
}
