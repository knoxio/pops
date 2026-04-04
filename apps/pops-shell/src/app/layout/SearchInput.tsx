import { useCallback, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input, Button } from "@pops/ui";
import { useSearchStore } from "@/store/searchStore";

const DEBOUNCE_MS = 300;

export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clear = useSearchStore((s) => s.clear);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        setQuery(value);
      }, DEBOUNCE_MS);

      // Update the input immediately for responsiveness
      // but debounce the store update
    },
    [setQuery]
  );

  const handleClear = useCallback(() => {
    clear();
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [clear]);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="hidden md:flex relative items-center max-w-sm w-full mx-4">
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search POPS..."
        defaultValue={query}
        onChange={handleChange}
        className="pl-9 pr-9 h-9 bg-muted/50 border-transparent focus:border-border focus:bg-background transition-colors"
        aria-label="Search POPS"
      />
      {query ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <kbd className="absolute right-2.5 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground pointer-events-none">
          ⌘K
        </kbd>
      )}
    </div>
  );
}
