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
const ItemDetailPage = lazy(() =>
  import("./pages/ItemDetailPage").then((m) => ({
    default: m.ItemDetailPage,
  })),
);
const ItemFormPage = lazy(() =>
  import("./pages/ItemFormPage").then((m) => ({ default: m.ItemFormPage })),
);
const WarrantiesPage = lazy(() =>
  import("./pages/WarrantiesPage").then((m) => ({
    default: m.WarrantiesPage,
  })),
);
const InsuranceReportPage = lazy(() =>
  import("./pages/InsuranceReportPage").then((m) => ({
    default: m.InsuranceReportPage,
  })),
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  icon: string;
  color?: "emerald" | "indigo" | "amber" | "rose" | "sky" | "violet";
  basePath: string;
  items: { path: string; label: string; icon: string }[];
}

export const navConfig = {
  id: "inventory",
  label: "Inventory",
  icon: "Package",
  color: "amber",
  basePath: "/inventory",
  items: [
    { path: "", label: "Items", icon: "Package" },
    { path: "/warranties", label: "Warranties", icon: "ShieldCheck" },
    { path: "/report", label: "Insurance Report", icon: "FileText" },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <ItemsPage /> },
  { path: "items/new", element: <ItemFormPage /> },
  { path: "items/:id", element: <ItemDetailPage /> },
  { path: "items/:id/edit", element: <ItemFormPage /> },
  { path: "warranties", element: <WarrantiesPage /> },
  { path: "report", element: <InsuranceReportPage /> },
];
