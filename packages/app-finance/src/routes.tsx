/**
 * Finance app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-finance and mounts them under /finance/*.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const TransactionsPage = lazy(() =>
  import("./pages/TransactionsPage").then((m) => ({
    default: m.TransactionsPage,
  }))
);
const EntitiesPage = lazy(() =>
  import("./pages/EntitiesPage").then((m) => ({ default: m.EntitiesPage }))
);
const BudgetsPage = lazy(() =>
  import("./pages/BudgetsPage").then((m) => ({ default: m.BudgetsPage }))
);
const InventoryPage = lazy(() =>
  import("./pages/InventoryPage").then((m) => ({ default: m.InventoryPage }))
);
const WishlistPage = lazy(() =>
  import("./pages/WishlistPage").then((m) => ({ default: m.WishlistPage }))
);
const ImportPage = lazy(() =>
  import("./pages/ImportPage").then((m) => ({ default: m.ImportPage }))
);
const AiUsagePage = lazy(() =>
  import("./pages/AiUsagePage").then((m) => ({ default: m.AiUsagePage }))
);

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface NavConfig {
  id: string;
  label: string;
  icon: string;
  basePath: string;
  items: NavItem[];
}

export const navConfig: NavConfig = {
  id: "finance",
  label: "Finance",
  icon: "DollarSign",
  basePath: "/finance",
  items: [
    { path: "", label: "Dashboard", icon: "LayoutDashboard" },
    { path: "/transactions", label: "Transactions", icon: "CreditCard" },
    { path: "/entities", label: "Entities", icon: "Building2" },
    { path: "/budgets", label: "Budgets", icon: "PiggyBank" },
    { path: "/inventory", label: "Inventory", icon: "Package" },
    { path: "/wishlist", label: "Wish List", icon: "Star" },
    { path: "/import", label: "Import", icon: "Download" },
    { path: "/ai-usage", label: "AI Usage", icon: "Bot" },
  ],
};

export const routes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: "transactions", element: <TransactionsPage /> },
  { path: "entities", element: <EntitiesPage /> },
  { path: "budgets", element: <BudgetsPage /> },
  { path: "inventory", element: <InventoryPage /> },
  { path: "wishlist", element: <WishlistPage /> },
  { path: "import", element: <ImportPage /> },
  { path: "ai-usage", element: <AiUsagePage /> },
];
