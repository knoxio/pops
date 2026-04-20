import { AppRail } from '../AppRail';
import { PageNav } from '../PageNav';

interface NavRegionProps {
  pageNavOpen: boolean;
  onClosePageNav: () => void;
}

export function NavRegion({ pageNavOpen, onClosePageNav }: NavRegionProps) {
  return (
    <>
      {/* Desktop + Tablet: app rail always visible at md+ */}
      <div className="hidden md:flex h-[calc(100vh-4rem)] sticky top-16 shrink-0">
        <AppRail />
        {/* Desktop only: permanent PageNav (lg+) */}
        <div className="hidden lg:block">
          <PageNav />
        </div>
      </div>

      {/* Tablet overlay: PageNav as overlay (md to lg) */}
      {pageNavOpen && (
        <div className="hidden md:block lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClosePageNav}
            aria-hidden="true"
          />
          <aside className="fixed left-16 top-16 bottom-0 z-50 shadow-lg">
            <PageNav />
          </aside>
        </div>
      )}
    </>
  );
}
