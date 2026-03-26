/**
 * Page navigation panel
 *
 * Renders page links for the currently active app, determined by URL.
 * Designed to sit alongside the AppRail (tb-030) in the two-level
 * navigation layout defined by PRD-003.
 */
import { Link, useLocation } from "react-router";
import { registeredApps } from "@/app/nav/registry";
import { iconMap } from "@/app/nav/icon-map";
import { findActiveApp, isPageActive } from "@/app/nav/path-utils";

const colorMap = {
  emerald: {
    bg: "bg-[oklch(0.65_0.15_150)]",
    text: "text-[oklch(0.65_0.15_150)]",
    muted: "text-[oklch(0.65_0.15_150/0.7)]",
  },
  indigo: {
    bg: "bg-[oklch(0.6_0.15_260)]",
    text: "text-[oklch(0.6_0.15_260)]",
    muted: "text-[oklch(0.6_0.15_260/0.7)]",
  },
  amber: {
    bg: "bg-[oklch(0.7_0.15_70)]",
    text: "text-[oklch(0.7_0.15_70)]",
    muted: "text-[oklch(0.7_0.15_70/0.7)]",
  },
  rose: {
    bg: "bg-[oklch(0.65_0.15_25)]",
    text: "text-[oklch(0.65_0.15_25)]",
    muted: "text-[oklch(0.65_0.15_25/0.7)]",
  },
  sky: {
    bg: "bg-[oklch(0.65_0.15_220)]",
    text: "text-[oklch(0.65_0.15_220)]",
    muted: "text-[oklch(0.65_0.15_220/0.7)]",
  },
  violet: {
    bg: "bg-[oklch(0.65_0.15_290)]",
    text: "text-[oklch(0.65_0.15_290)]",
    muted: "text-[oklch(0.65_0.15_290/0.7)]",
  },
} as const;

export function PageNav() {
  const location = useLocation();
  const activeApp = findActiveApp(location.pathname, registeredApps);

  if (!activeApp) return null;

  const appColors = activeApp.color ? colorMap[activeApp.color] : null;

  return (
    <nav
      className="w-[200px] bg-card border-r border-border h-full overflow-y-auto transition-all duration-200"
      aria-label={`${activeApp.label} pages`}
    >
      <div className="px-4 py-4 border-b border-border">
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.15em] ${appColors?.text || "text-muted-foreground"}`}
        >
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
                  ? `${appColors?.bg || "bg-primary"} text-white shadow-sm`
                  : `text-foreground/80 hover:bg-muted hover:text-foreground`
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    active
                      ? "text-white"
                      : `${appColors?.muted || "text-muted-foreground"} group-hover:text-foreground`
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
