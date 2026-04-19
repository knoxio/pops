import { Search } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TextInput } from '@pops/ui';

import type { ChangeEvent } from 'react';

import type { SearchMode } from './types';

interface SearchInputProps {
  query: string;
  mode: SearchMode;
  onQueryChange: (q: string) => void;
  onModeChange: (mode: SearchMode) => void;
}

export function SearchInput({ query, mode, onQueryChange, onModeChange }: SearchInputProps) {
  return (
    <>
      <TextInput
        type="search"
        placeholder="Search movies and TV shows…"
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value)}
        prefix={<Search className="h-4 w-4" />}
        clearable
        onClear={() => onQueryChange('')}
        autoFocus
      />

      <Tabs value={mode} onValueChange={(v: string) => onModeChange(v as SearchMode)}>
        <TabsList>
          <TabsTrigger value="both">Both</TabsTrigger>
          <TabsTrigger value="movies">Movies</TabsTrigger>
          <TabsTrigger value="tv">TV Shows</TabsTrigger>
        </TabsList>
      </Tabs>
    </>
  );
}
