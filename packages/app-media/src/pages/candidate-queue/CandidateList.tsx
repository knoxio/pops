import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { Skeleton } from '@pops/ui';

import { unwrap } from '../../media-api-helpers.js';
import { rotationListCandidates } from '../../media-api/index.js';
import { CandidateCard } from './CandidateCard';
import { Pagination } from './Pagination';

import type { Candidate } from './CandidateCard';

const PAGE_SIZE = 20;

interface CandidateListProps {
  status: 'pending' | 'added' | 'excluded';
  actions: 'pending' | 'excluded' | 'none';
}

function SearchInput({ search, onChange }: { search: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function CandidateLoading() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-22 w-full rounded-md" />
      ))}
    </div>
  );
}

export function CandidateList({ status, actions }: CandidateListProps) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const queryInput = {
    status,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: ['media', 'rotation', 'listCandidates', queryInput],
    queryFn: async () => unwrap(await rotationListCandidates({ query: queryInput })),
  });

  const result = query.data?.data;
  const items: Candidate[] = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function renderBody() {
    if (query.isLoading) return <CandidateLoading />;
    if (!items.length) {
      return <p className="text-sm text-muted-foreground py-8 text-center">No candidates found</p>;
    }
    return (
      <>
        <div className="space-y-2">
          {items.map((c) => (
            <CandidateCard key={c.id} candidate={c} actions={actions} />
          ))}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </>
    );
  }

  return (
    <div className="space-y-3">
      <SearchInput
        search={search}
        onChange={(v) => {
          setSearch(v);
          setPage(0);
        }}
      />
      {renderBody()}
    </div>
  );
}
