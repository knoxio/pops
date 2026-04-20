import { useRef, useState } from 'react';

import { useRecentSearches } from './recent-searches';
import { SearchInputDropdown } from './search-input/SearchInputDropdown';
import { SearchInputField } from './search-input/SearchInputField';
import { useSearchInputData } from './search-input/useSearchInputData';
import { useCmdKShortcut, useSearchInputHandlers } from './search-input/useSearchInputHandlers';
import { useSearchKeyboardNav } from './search-keyboard-nav';
import { useSearchStore } from './searchStore';
import { useFocusTrap } from './useFocusTrap';

export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = useSearchStore((s) => s.query);
  const isOpen = useSearchStore((s) => s.isOpen);
  const setOpen = useSearchStore((s) => s.setOpen);
  const [isFocused, setIsFocused] = useState(false);
  const { queries } = useRecentSearches();

  const { sections, orderedUris, handleShowMore } = useSearchInputData({ query, isOpen });
  const { handleResultClick, handleClose, handleChange, handleClear } = useSearchInputHandlers({
    inputRef,
  });

  const { selectedIndex } = useSearchKeyboardNav({
    containerRef,
    resultCount: orderedUris.length,
    onSelect: (index) => {
      handleResultClick(orderedUris[index] ?? '');
    },
    onClose: handleClose,
  });

  useCmdKShortcut(inputRef);

  const showPanel = isOpen && (query.length > 0 || (isFocused && queries.length > 0));
  useFocusTrap({ containerRef, active: showPanel });

  return (
    <div ref={containerRef} className="hidden md:flex relative items-center max-w-sm w-full mx-4">
      <SearchInputField
        inputRef={inputRef}
        query={query}
        onChange={handleChange}
        onClear={handleClear}
        onFocus={() => {
          setIsFocused(true);
          setOpen(true);
        }}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
      />
      {showPanel && (
        <SearchInputDropdown
          inputRef={inputRef}
          query={query}
          sections={sections}
          selectedIndex={selectedIndex}
          onClose={handleClose}
          onResultClick={handleResultClick}
          onShowMore={handleShowMore}
        />
      )}
    </div>
  );
}
