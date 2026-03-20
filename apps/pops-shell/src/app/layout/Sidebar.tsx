/**
 * Sidebar navigation
 *
 * Renders navigation items driven by registered app navConfigs.
 *
 * Responsive behaviour:
 * - Desktop (≥768px): Fixed sidebar that pushes content
 * - Mobile (<768px): Overlay sidebar with backdrop, closes on link click
 */
import { Link, useLocation } from "react-router";
import { registeredApps } from "@/app/nav/registry";
import { iconMap } from "@/app/nav/icon-map";
import { useUIStore } from "@/store/uiStore";
import { X } from "lucide-react";

interface SidebarProps {
  open: boolean;
}

export function Sidebar({ open }: SidebarProps) {
  const location = useLocation();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  if (!open) return null;

  const handleNavClick = () => {
    // Close sidebar on mobile after navigating
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const navContent = (
    <nav className="p-4 space-y-1">
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
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-4 py-3 md:py-2 rounded-lg transition-colors font-medium min-h-[44px] ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              <span>{item.label}</span>
            </Link>
          );
        })
      )}
    </nav>
  );

  return (
    <>
      {/* Mobile: overlay backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={[
          "w-64 bg-card border-r border-border fixed z-50",
          // Mobile: full height overlay from top
          "top-0 left-0 h-full",
          // Desktop: below top bar (md:h-16 = 4rem)
          "md:top-16 md:h-[calc(100vh-4rem)]",
          // Desktop: z-index below overlay
          "md:z-30",
        ].join(" ")}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-4 border-b border-border md:hidden">
          <span className="text-lg font-bold">POPS</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-muted rounded-lg"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {navContent}
      </aside>
    </>
  );
}
