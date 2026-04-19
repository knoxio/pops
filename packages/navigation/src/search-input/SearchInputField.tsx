import { Search, X } from 'lucide-react';
import { type RefObject } from 'react';

import { Button, Input } from '@pops/ui';

interface SearchInputFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

export function SearchInputField({
  inputRef,
  query,
  onChange,
  onFocus,
  onBlur,
  onClear,
}: SearchInputFieldProps) {
  return (
    <>
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search POPS..."
        defaultValue={query}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        className="pl-9 pr-9 h-9 bg-muted/50 border-transparent focus:border-border focus:bg-background transition-colors"
        aria-label="Search POPS"
      />
      {query ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
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
    </>
  );
}
