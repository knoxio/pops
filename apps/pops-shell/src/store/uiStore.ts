/**
 * UI store - manages UI state like sidebar open/close
 * Persisted to localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  railOpen: boolean;
  pageNavOpen: boolean;
  /**
   * When true, the next location-change close of the PageNav overlay is
   * suppressed. Used by AppRail to prevent the navigation it triggers from
   * immediately collapsing the overlay it is about to open.
   */
  skipNextPageNavClose: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleRail: () => void;
  setRailOpen: (open: boolean) => void;
  togglePageNav: () => void;
  setPageNavOpen: (open: boolean) => void;
  setSkipNextPageNavClose: (skip: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      railOpen: true,
      pageNavOpen: false,
      skipNextPageNavClose: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
      setRailOpen: (open) => set({ railOpen: open }),
      togglePageNav: () => set((state) => ({ pageNavOpen: !state.pageNavOpen })),
      setPageNavOpen: (open) => set({ pageNavOpen: open }),
      setSkipNextPageNavClose: (skip) => set({ skipNextPageNavClose: skip }),
    }),
    {
      name: 'pops-ui-storage',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        railOpen: state.railOpen,
      }),
    }
  )
);
