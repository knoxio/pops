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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background decorative elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0 opacity-20 dark:opacity-10">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <div className="relative z-10">
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
    </div>
  );
}
