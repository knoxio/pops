import { ArrowLeft, Search, X } from 'lucide-react';
import { type RefObject, useCallback, useEffect, useRef } from 'react';

import { Button, Input } from '@pops/ui';

import { useSearchStore } from './searchStore';

const DEBOUNCE_MS = 300;

interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface SearchHandlers {
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleClear: () => void;
  handleClose: () => void;
  cancelDebounce: () => void;
}

function useMobileSearchHandlers(
  inputRef: RefObject<HTMLInputElement | null>,
  onClose: () => void
): SearchHandlers {
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelDebounce(), [cancelDebounce]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      cancelDebounce();
      debounceTimerRef.current = setTimeout(() => setQuery(value), DEBOUNCE_MS);
    },
    [cancelDebounce, setQuery]
  );

  const handleClear = useCallback(() => {
    cancelDebounce();
    clear();
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }, [cancelDebounce, clear, inputRef]);

  const handleClose = useCallback(() => {
    cancelDebounce();
    clear();
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  }, [cancelDebounce, clear, onClose, inputRef]);

  return { handleChange, handleClear, handleClose, cancelDebounce };
}

function useOverlayKeyboard(open: boolean, onClose: () => void, cancelDebounce: () => void): void {
  useEffect(() => {
    if (!open) {
      cancelDebounce();
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, cancelDebounce]);
}

function useAutoFocusOnOpen(open: boolean, inputRef: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open, inputRef]);
}

interface OverlayInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

function OverlayInput({ inputRef, query, onChange, onClear }: OverlayInputProps) {
  return (
    <div className="relative flex flex-1 items-center">
      <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search POPS..."
        defaultValue={query}
        onChange={onChange}
        className="h-9 border-transparent bg-muted/50 pl-9 pr-9 transition-colors focus:border-border focus:bg-background"
        aria-label="Search POPS"
        data-testid="mobile-search-input"
      />
      {query && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function MobileSearchOverlay({ open, onClose }: MobileSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((s) => s.query);
  const { handleChange, handleClear, handleClose, cancelDebounce } = useMobileSearchHandlers(
    inputRef,
    onClose
  );

  useAutoFocusOnOpen(open, inputRef);
  useOverlayKeyboard(open, handleClose, cancelDebounce);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 border-b border-border bg-card px-3 md:hidden"
      data-testid="mobile-search-overlay"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClose}
        className="min-h-[44px] min-w-[44px] shrink-0"
        aria-label="Close search"
        data-testid="mobile-search-close"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <OverlayInput
        inputRef={inputRef}
        query={query}
        onChange={handleChange}
        onClear={handleClear}
      />
    </div>
  );
}
