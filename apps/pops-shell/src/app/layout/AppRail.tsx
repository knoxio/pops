/**
 * App rail — narrow vertical strip showing registered app icons.
 *
 * Discord-style left-edge indicator for the active app.
 * Single click navigates to the app's basePath.
 * Collapsible via toggle (state persisted in uiStore).
 */
import { useNavigate, useLocation } from "react-router";
import { registeredApps } from "@/app/nav/registry";
import { iconMap } from "@/app/nav/icon-map";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@pops/ui";

interface AppRailProps {
  className?: string;
}

export function AppRail({ className }: AppRailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const railOpen = useUIStore((state) => state.railOpen);
  const toggleRail = useUIStore((state) => state.toggleRail);

  if (!railOpen) {
    return (
      <div
        className={[
          "w-0 md:w-10 shrink-0 bg-card border-r border-border",
          "hidden md:flex flex-col items-center pt-2",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          onClick={toggleRail}
          className="min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-muted rounded-lg"
          aria-label="Expand app rail"
        >
          <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={[
        "w-16 shrink-0 bg-card border-r border-border",
        "hidden md:flex flex-col items-center py-2 gap-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {registeredApps.map((app) => {
        const isActive = location.pathname.startsWith(app.basePath);
        const Icon = iconMap[app.icon];

        return (
          <Tooltip key={app.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate(app.basePath)}
                className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors"
                aria-label={app.label}
                aria-current={isActive ? "page" : undefined}
              >
                {/* Active indicator — left-edge pill */}
                <span
                  className={[
                    "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all",
                    isActive ? "h-6 bg-primary" : "h-0 bg-transparent",
                  ].join(" ")}
                />

                <span
                  className={[
                    "flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {Icon ? (
                    <Icon className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">
                      {app.label[0]}
                    </span>
                  )}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{app.label}</TooltipContent>
          </Tooltip>
        );
      })}

      {/* Collapse toggle at bottom */}
      <div className="mt-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleRail}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-muted rounded-lg"
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
