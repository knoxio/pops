/**
 * Page navigation panel
 *
 * Renders page links for the currently active app, determined by URL.
 * Designed to sit alongside the AppRail (tb-030) in the two-level
 * navigation layout defined by PRD-003.
 */
import { Link, useLocation } from "react-router";
import { registeredApps } from "@/app/nav/registry";
import type { AppNavConfig } from "@/app/nav/types";
import {
  LayoutDashboard,
  CreditCard,
  Building2,
  PiggyBank,
  Package,
  Star,
  Download,
  Bot,
  type LucideIcon,
} from "lucide-react";

/** Map icon name strings from navConfig to Lucide components. */
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  CreditCard,
  Building2,
  PiggyBank,
  Package,
  Star,
  Download,
  Bot,
};

/** Find the active app by matching the current pathname against registered base paths. */
export function findActiveApp(
  pathname: string,
  apps: AppNavConfig[],
): AppNavConfig | undefined {
  return apps.find((app) => pathname.startsWith(app.basePath));
}

/** Check if a page item is active given the current pathname and its app's basePath. */
export function isPageActive(
  pathname: string,
  basePath: string,
  itemPath: string,
): boolean {
  if (itemPath === "") {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname.startsWith(`${basePath}${itemPath}`);
}

export function PageNav() {
  const location = useLocation();
  const activeApp = findActiveApp(location.pathname, registeredApps);

  if (!activeApp) return null;

  return (
    <nav
      className="w-[200px] bg-card border-r border-border h-full overflow-y-auto transition-all duration-200"
      aria-label={`${activeApp.label} pages`}
    >
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {activeApp.label}
        </span>
      </div>

      <div className="p-2 space-y-0.5">
        {activeApp.items.map((item) => {
          const fullPath = `${activeApp.basePath}${item.path}`;
          const active = isPageActive(
            location.pathname,
            activeApp.basePath,
            item.path,
          );
          const Icon = iconMap[item.icon];

          return (
            <Link
              key={fullPath}
              to={fullPath}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
