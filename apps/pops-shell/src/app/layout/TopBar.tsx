/**
 * Top bar - user info, theme toggle, menu button, search
 *
 * Responsive: hides user email on mobile (<768px).
 * Mobile: search icon button expands to full-width overlay.
 * Desktop: always-visible search input.
 * All interactive elements meet 44x44px minimum touch targets.
 */
import { Button } from '@pops/ui';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useState } from 'react';

import { useThemeStore } from '@/store/themeStore';
import { useUIStore } from '@/store/uiStore';

import { BuildVersion } from './BuildVersion';
import { MobileSearchOverlay } from './MobileSearchOverlay';
import { SearchInput } from './SearchInput';

export function TopBar() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <>
      <header className="bg-card border-b border-border h-14 md:h-16 flex items-center px-3 md:px-4 fixed top-0 w-full z-40">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="min-w-[44px] min-h-[44px] mr-2 md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-baseline gap-1.5">
          <h1 className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-br from-[oklch(0.7_0.2_150)] via-[oklch(0.6_0.2_260)] to-[oklch(0.6_0.2_320)] tracking-tighter">
            POPS
          </h1>
          <BuildVersion />
        </div>

        <SearchInput />

        <div className="ml-auto flex items-center gap-1 md:gap-4">
          {/* Mobile search icon — visible only on mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileSearchOpen(true)}
            className="min-w-[44px] min-h-[44px] md:hidden"
            aria-label="Open search"
            data-testid="mobile-search-btn"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="min-w-[44px] min-h-[44px] transition-colors group"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 text-amber-400 group-hover:text-amber-300 transition-colors" />
            ) : (
              <Moon className="h-5 w-5 text-indigo-600 group-hover:text-indigo-500 transition-colors" />
            )}
          </Button>

          <div className="hidden md:block text-sm text-muted-foreground">user@example.com</div>
        </div>
      </header>

      <MobileSearchOverlay open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
    </>
  );
}
