/**
 * App registry — single source of truth for navigation.
 *
 * To add a new app:
 * 1. Create a package in packages/app-<name>/
 * 2. Export a navConfig: AppNavConfig from its index.ts
 * 3. Import it here and add to the registeredApps array
 * 4. Add its routes to the shell router (app/router.tsx)
 */
import { navConfig as financeNavConfig } from "@pops/app-finance";
import { navConfig as mediaNavConfig } from "@pops/app-media";
import { navConfig as inventoryNavConfig } from "@pops/app-inventory";
import { navConfig as aiNavConfig } from "@pops/app-ai";
import type { AppNavConfig } from "./types";

/** All registered app nav configs. Order determines display order in the app rail. */
export const registeredApps: AppNavConfig[] = [financeNavConfig, mediaNavConfig, inventoryNavConfig, aiNavConfig];

export type { AppNavConfig, AppNavItem } from "./types";
