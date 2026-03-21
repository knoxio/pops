/**
 * Inventory app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-inventory and mounts them under /inventory/*.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router";

const ItemsPage = lazy(() =>
  import("./pages/ItemsPage").then((m) => ({ default: m.ItemsPage })),
);
const ItemFormPage = lazy(() =>
  import("./pages/ItemFormPage").then((m) => ({ default: m.ItemFormPage })),
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  icon: string;
  basePath: string;
  items: { path: string; label: string; icon: string }[];
}

export const navConfig = {
  id: "inventory",
  label: "Inventory",
  icon: "Package",
  basePath: "/inventory",
  items: [{ path: "", label: "Items", icon: "Package" }],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <ItemsPage /> },
  { path: "items/new", element: <ItemFormPage /> },
  { path: "items/:id/edit", element: <ItemFormPage /> },
];
