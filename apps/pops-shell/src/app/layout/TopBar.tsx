import { useUIStore } from '@/store/uiStore';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Top bar - user info, theme toggle, menu button, search
 *
 * Responsive: hides user email on mobile (<768px).
 * Mobile: search icon button expands to full-width overlay.
 * Desktop: always-visible search input.
 * All interactive elements meet 44x44px minimum touch targets.
 */
import { Button } from '@pops/ui';

import { BuildVersion } from './BuildVersion';
import { MobileSearchOverlay } from './MobileSearchOverlay';
import { SearchInput } from './SearchInput';
import { TopBarActions } from './top-bar/TopBarActions';

export function TopBar() {
  const { t } = useTranslation('shell');
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
          aria-label={t('toggleSidebar')}
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

        <TopBarActions onOpenMobileSearch={() => setMobileSearchOpen(true)} />
      </header>

      <MobileSearchOverlay open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
    </>
  );
}
