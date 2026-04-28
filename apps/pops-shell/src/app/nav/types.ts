/**
 * App navigation types for the POPS shell.
 *
 * Each app package exports a navConfig conforming to AppNavConfig.
 * The shell maintains a registry of all configs — single source of truth
 * for navigation rendering.
 */

import type { IconName } from '@pops/navigation';

export type { IconName };

export interface AppNavItem {
  /** Relative to basePath. Empty string '' for the index/default page. */
  path: string;
  label: string;
  /** i18n key in the `navigation` namespace (e.g. `finance.dashboard`). */
  labelKey: string;
  /** Lucide icon component name — must be a member of IconName. */
  icon: IconName;
}

export interface AppNavConfig {
  /** Unique app identifier (e.g. 'finance', 'media', 'inventory'). */
  id: string;
  /** Display name shown in the app rail tooltip and page nav header. */
  label: string;
  /** i18n key in the `navigation` namespace (e.g. `finance`). */
  labelKey: string;
  /** Lucide icon component name for the app rail — must be a member of IconName. */
  icon: IconName;
  /** Optional theme color for this app (e.g. 'emerald', 'indigo'). */
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  /** Root path for this app (e.g. '/finance'). */
  basePath: string;
  /** Pages within this app. */
  items: AppNavItem[];
}
