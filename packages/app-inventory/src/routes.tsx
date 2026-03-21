/**
 * Inventory app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-inventory and mounts them under /inventory/*.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router";

const ItemsPage = lazy(() =>
  import("./pages/ItemsPage").then((m) => ({ default: m.ItemsPage }))
);
const LocationTreePage = lazy(() =>
  import("./pages/LocationTreePage").then((m) => ({
    default: m.LocationTreePage,
  }))
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
  items: [
    { path: "", label: "Items", icon: "Package" },
    { path: "/locations", label: "Locations", icon: "MapPin" },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <ItemsPage /> },
  { path: "locations", element: <LocationTreePage /> },
];
