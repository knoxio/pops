/**
 * Page navigation panel
 *
 * Renders page links for the currently active app, determined by URL.
 * Designed to sit alongside the AppRail (tb-030) in the two-level
 * navigation layout defined by PRD-003.
 *
 * Colour is inherited from --app-accent CSS variable set on the shell root.
 */
import { Link, useLocation } from "react-router";
import { registeredApps } from "@/app/nav/registry";
import { iconMap } from "@/app/nav/icon-map";
import { findActiveApp, isPageActive } from "@/app/nav/path-utils";

export function PageNav() {
  const location = useLocation();
  const activeApp = findActiveApp(location.pathname, registeredApps);

  if (!activeApp) return null;

  return (
    <nav
      className="w-50 bg-card border-r border-border h-full overflow-y-auto transition-all duration-200"
      aria-label={`${activeApp.label} pages`}
    >
      <div className="px-4 py-4 border-b border-border">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-app-accent">
          {activeApp.label}
        </span>
      </div>

      <div className="p-2 space-y-0.5">
        {activeApp.items.map((item) => {
          const fullPath = `${activeApp.basePath}${item.path}`;
          const active = isPageActive(location.pathname, activeApp.basePath, item.path);
          const Icon = iconMap[item.icon];

          return (
            <Link
              key={fullPath}
              to={fullPath}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                active
                  ? "bg-app-accent text-app-accent-foreground shadow-sm"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    active
                      ? "text-app-accent-foreground"
                      : "text-app-accent/70 group-hover:text-foreground"
                  }`}
                />
              )}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
