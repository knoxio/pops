/**
 * App rail — narrow vertical strip showing registered app icons.
 *
 * Discord-style left-edge indicator for the active app.
 * Single click navigates to the app's basePath.
 * Collapsible via toggle (state persisted in uiStore).
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { registeredApps } from "@/app/nav/registry";
import { iconMap } from "@/app/nav/icon-map";
import { matchesAtBoundary } from "@/app/nav/path-utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@pops/ui";

interface AppRailProps {
  className?: string;
}

/** Media query match for tablet range (md but not lg) */
function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    setIsTablet(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isTablet;
}

export function AppRail({ className }: AppRailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const railOpen = useUIStore((state) => state.railOpen);
  const toggleRail = useUIStore((state) => state.toggleRail);
  const setPageNavOpen = useUIStore((state) => state.setPageNavOpen);
  const isTablet = useIsTablet();

  if (!railOpen) {
    return (
      <div
        className={cn(
          "w-0 md:w-10 shrink-0 bg-card border-r border-border",
          "hidden md:flex flex-col items-center pt-2",
          className
        )}
      >
        <button
          onClick={toggleRail}
          className="min-w-9 min-h-9 flex items-center justify-center hover:bg-muted rounded-lg"
          aria-label="Expand app rail"
        >
          <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-16 shrink-0 bg-card border-r border-border",
        "hidden md:flex flex-col py-2 gap-2",
        className
      )}
    >
      {registeredApps.map((app) => {
        const isActive = matchesAtBoundary(location.pathname, app.basePath);
        const Icon = iconMap[app.icon];
        const appColorClass = app.color ? `app-${app.color}` : undefined;

        return (
          <Tooltip key={app.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  navigate(app.basePath);
                  if (isTablet) {
                    setPageNavOpen(true);
                  }
                }}
                className={cn(
                  "relative w-full flex items-center justify-center py-1 transition-colors group",
                  appColorClass
                )}
                aria-label={app.label}
                aria-current={isActive ? "page" : undefined}
              >
                {/* Active indicator — absolute left edge of rail */}
                <span
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-300",
                    isActive
                      ? "h-8 bg-app-accent"
                      : "h-0 bg-transparent group-hover:h-4 group-hover:bg-muted-foreground/40"
                  )}
                />

                <span
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300",
                    isActive
                      ? "bg-app-accent text-app-accent-foreground shadow-lg shadow-foreground/20 rounded-xl scale-100"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground hover:rounded-xl scale-95 hover:scale-100"
                  )}
                >
                  {Icon ? (
                    <Icon className="h-6 w-6" />
                  ) : (
                    <span className="text-lg font-semibold">{app.label[0]}</span>
                  )}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{app.label}</TooltipContent>
          </Tooltip>
        );
      })}

      {/* Collapse toggle at bottom */}
      <div className="mt-auto flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleRail}
              className="min-w-9 min-h-9 flex items-center justify-center hover:bg-muted rounded-lg"
              aria-label="Collapse app rail"
            >
              <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Collapse</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
