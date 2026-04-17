/**
 * Search store — manages search input state
 * Not persisted (search is ephemeral)
 */
import { create } from 'zustand';

interface SearchState {
  query: string;
  isOpen: boolean;
  setQuery: (query: string) => void;
  setOpen: (open: boolean) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  isOpen: false,
  setQuery: (query) => {
    set({ query, isOpen: query.length > 0 });
  },
  setOpen: (open) => {
    set({ isOpen: open });
  },
  clear: () => {
    set({ query: '', isOpen: false });
  },
}));
