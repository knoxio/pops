/**
 * AI app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-ai and mounts them under /ai/*.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router";

const AiUsagePage = lazy(() =>
  import("./pages/AiUsagePage").then((m) => ({ default: m.AiUsagePage }))
);

/** Shared navigation types (mirrored from shell to avoid circular dependency) */
export interface AppNavItem {
  path: string;
  label: string;
  icon: string;
}

export interface AppNavConfig {
  id: string;
  label: string;
  icon: string;
  color?: "emerald" | "indigo" | "amber" | "rose" | "sky" | "violet";
  basePath: string;
  items: AppNavItem[];
}

export const navConfig: AppNavConfig = {
  id: "ai",
  label: "AI",
  icon: "Bot",
  color: "violet",
  basePath: "/ai",
  items: [{ path: "", label: "AI Usage", icon: "BarChart3" }],
};

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
];
