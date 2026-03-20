/**
 * Root layout — top bar + two-level navigation + content area
 *
 * Desktop (≥768px): AppRail (icons) + PageNav (page links) push content
 * Mobile (<768px): Hamburger opens Sidebar overlay with all pages
 */
import { Outlet } from "react-router";
import { TopBar } from "./TopBar";
import { AppRail } from "./AppRail";
import { PageNav } from "./PageNav";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "@pops/ui";
import { useUIStore } from "@/store/uiStore";

export function RootLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="flex">
        {/* Desktop: two-level nav (app rail + page nav) */}
        <div className="hidden md:flex h-[calc(100vh-4rem)] sticky top-16 shrink-0">
          <AppRail />
          <PageNav />
        </div>

        {/* Mobile: overlay sidebar */}
        <Sidebar open={sidebarOpen} />

        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6 lg:p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
