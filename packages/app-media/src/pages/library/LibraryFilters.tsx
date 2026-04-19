import { Search } from 'lucide-react';

import { Button, Select, TextInput } from '@pops/ui';

import { SORT_OPTIONS, TYPE_OPTIONS } from './types';

import type { MediaType, SortOption } from '../../hooks/useMediaLibrary';

interface LibraryFiltersProps {
  typeFilter: MediaType;
  sortBy: SortOption;
  genreFilter: string | null;
  allGenres: string[];
  localSearch: string;
  setLocalSearch: (v: string) => void;
  setParam: (key: string, value: string) => void;
}

function TypeToggle({
  typeFilter,
  setParam,
}: Pick<LibraryFiltersProps, 'typeFilter' | 'setParam'>) {
  return (
    <div
      className="flex rounded-lg border bg-muted/30 p-0.5"
      role="group"
      aria-label="Filter by type"
    >
      {TYPE_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={typeFilter === opt.value ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setParam('type', opt.value === 'all' ? '' : opt.value)}
          aria-pressed={typeFilter === opt.value}
          className={`text-xs font-semibold uppercase tracking-wider ${
            typeFilter === opt.value
              ? 'bg-app-accent text-white shadow-sm hover:bg-app-accent/90'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function LibraryFilters(props: LibraryFiltersProps) {
  const { genreFilter, allGenres, sortBy, setParam, localSearch, setLocalSearch } = props;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <TypeToggle typeFilter={props.typeFilter} setParam={setParam} />
      {allGenres.length > 0 && (
        <Select
          value={genreFilter ?? ''}
          onChange={(e) => setParam('genre', e.target.value)}
          aria-label="Filter by genre"
          size="sm"
          options={[
            { value: '', label: 'All Genres' },
            ...allGenres.map((genre) => ({ value: genre, label: genre })),
          ]}
        />
      )}
      <Select
        value={sortBy}
        onChange={(e) => setParam('sort', e.target.value)}
        aria-label="Sort by"
        size="sm"
        options={SORT_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
      />
      <TextInput
        placeholder="Search library..."
        value={localSearch}
        onChange={(e) => setLocalSearch(e.target.value)}
        prefix={<Search className="h-4 w-4" />}
        clearable
        onClear={() => setLocalSearch('')}
        className="w-full sm:max-w-xs"
        size="sm"
      />
    </div>
  );
}
