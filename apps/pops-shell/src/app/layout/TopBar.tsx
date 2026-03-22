/**
 * Top bar - user info, theme toggle, menu button
 *
 * Responsive: hides user email on mobile (<768px).
 * All interactive elements meet 44x44px minimum touch targets.
 */
import { useThemeStore } from "@/store/themeStore";
import { useUIStore } from "@/store/uiStore";
import { Menu, Sun, Moon } from "lucide-react";

export function TopBar() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  return (
    <header className="bg-card border-b border-border h-14 md:h-16 flex items-center px-3 md:px-4 sticky top-0 z-40">
      <button
        onClick={toggleSidebar}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-muted rounded-lg mr-2 md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-br from-[oklch(0.7_0.2_150)] via-[oklch(0.6_0.2_260)] to-[oklch(0.6_0.2_320)] tracking-tighter">
        POPS
      </h1>

      <div className="ml-auto flex items-center gap-1 md:gap-4">
        <button
          onClick={toggleTheme}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-muted rounded-lg transition-colors group"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 text-amber-400 group-hover:text-amber-300 transition-colors" />
          ) : (
            <Moon className="h-5 w-5 text-indigo-600 group-hover:text-indigo-500 transition-colors" />
          )}
        </button>

        <div className="hidden md:block text-sm text-muted-foreground">
          user@example.com
        </div>
      </div>
    </header>
  );
}
