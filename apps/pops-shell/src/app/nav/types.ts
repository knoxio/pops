/**
 * App navigation types for the POPS shell.
 *
 * Each app package exports a navConfig conforming to AppNavConfig.
 * The shell maintains a registry of all configs — single source of truth
 * for navigation rendering.
 */

export interface AppNavItem {
  /** Relative to basePath. Empty string '' for the index/default page. */
  path: string;
  label: string;
  /** Lucide icon component name (e.g. 'LayoutDashboard', 'CreditCard'). */
  icon: string;
}

export interface AppNavConfig {
  /** Unique app identifier (e.g. 'finance', 'media', 'inventory'). */
  id: string;
  /** Display name shown in the app rail tooltip and page nav header. */
  label: string;
  /** Lucide icon component name for the app rail (e.g. 'DollarSign'). */
  icon: string;
  /** Optional theme color for this app (e.g. 'emerald', 'indigo'). */
  color?: "emerald" | "indigo" | "amber" | "rose" | "sky" | "violet";
  /** Root path for this app (e.g. '/finance'). */
  basePath: string;
  /** Pages within this app. */
  items: AppNavItem[];
}
