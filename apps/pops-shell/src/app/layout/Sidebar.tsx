/**
 * Sidebar navigation
 *
 * Renders navigation items driven by registered app navConfigs.
 * Currently only Finance is registered; the structure supports
 * adding more apps (media, inventory, etc.) in future phases.
 */
import { Link, useLocation } from "react-router";
import { navConfig } from "@pops/app-finance";
import type { NavConfig } from "@pops/app-finance";
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

interface SidebarProps {
  open: boolean;
}

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

/** All registered app nav configs — add new apps here. */
const registeredApps: NavConfig[] = [navConfig];

export function Sidebar({ open }: SidebarProps) {
  const location = useLocation();

  if (!open) return null;

  return (
    <aside className="w-64 bg-card border-r border-border h-[calc(100vh-4rem)] fixed top-16 left-0">
      <nav className="p-4 space-y-2">
        {registeredApps.map((app) =>
          app.items.map((item) => {
            const fullPath = `${app.basePath}${item.path}`;
            const isActive =
              item.path === ""
                ? location.pathname === app.basePath ||
                  location.pathname === `${app.basePath}/`
                : location.pathname.startsWith(fullPath);
            const Icon = iconMap[item.icon];

            return (
              <Link
                key={fullPath}
                to={fullPath}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors font-medium ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {Icon && <Icon className="h-5 w-5" />}
                <span>{item.label}</span>
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
