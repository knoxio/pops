/**
 * Top bar - user info, theme toggle, menu button
 */
import { useThemeStore } from "@/store/themeStore";
import { useUIStore } from "@/store/uiStore";

export function TopBar() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  return (
    <header className="bg-card border-b border-border h-16 flex items-center px-4">
      <button
        onClick={toggleSidebar}
        className="mr-4 p-2 hover:bg-muted rounded"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>

      <h1 className="text-xl font-bold">POPS</h1>

      <div className="ml-auto flex items-center gap-4">
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-muted rounded"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>

        <div className="text-sm text-muted-foreground">user@example.com</div>
      </div>
    </header>
  );
}
