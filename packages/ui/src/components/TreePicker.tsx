/**
 * TreePicker — TreeView inside a Popover with search and optional inline create.
 *
 * Generic over the node data. Consumers resolve display labels through
 * `getLabel(data)`. Filter is a recursive substring match on labels.
 */
import { Check, Plus, Search } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { type TreeNode, TreeView } from './TreeView';

export interface TreePickerProps<T> {
  nodes: TreeNode<T>[];
  getLabel: (data: T) => string;
  selectedId?: string | null;
  onSelect: (node: TreeNode<T>) => void;
  /** Optional inline create action. */
  onCreate?: (query: string, parent: TreeNode<T> | null) => void;
  placeholder?: string;
  trigger?: ReactNode;
  triggerLabel?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function filterNodes<T>(nodes: TreeNode<T>[], predicate: (data: T) => boolean): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  for (const n of nodes) {
    const kids = filterNodes(n.children, predicate);
    if (predicate(n.data) || kids.length > 0) {
      out.push({ ...n, children: kids });
    }
  }
  return out;
}

function collectIds<T>(nodes: TreeNode<T>[], into: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    into.add(n.id);
    collectIds(n.children, into);
  }
  return into;
}

interface NoMatchesProps<T> {
  query: string;
  onCreate?: (query: string, parent: TreeNode<T> | null) => void;
  onCreated: () => void;
}

function NoMatches<T>({ query, onCreate, onCreated }: NoMatchesProps<T>) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
      <div>No matches for &ldquo;{query}&rdquo;</div>
      {onCreate && query.trim() ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onCreate(query.trim(), null);
            onCreated();
          }}
        >
          <Plus /> Create &ldquo;{query.trim()}&rdquo;
        </Button>
      ) : null}
    </div>
  );
}

interface PickerBodyProps<T> {
  query: string;
  setQuery: (v: string) => void;
  placeholder: string;
  filtered: TreeNode<T>[];
  expandedIds: Set<string>;
  onCreate?: (q: string, parent: TreeNode<T> | null) => void;
  selectedId: string | null;
  onSelect: (n: TreeNode<T>) => void;
  getLabel: (data: T) => string;
}

function PickerBody<T>({
  query,
  setQuery,
  placeholder,
  filtered,
  expandedIds,
  onCreate,
  selectedId,
  onSelect,
  getLabel,
}: PickerBodyProps<T>) {
  return (
    <PopoverContent className="w-[320px] p-0" align="start">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-7 border-0 p-0 focus-visible:ring-0 shadow-none"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <NoMatches query={query} onCreate={onCreate} onCreated={() => setQuery('')} />
        ) : (
          <TreeView
            nodes={filtered}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds.size > 0 ? expandedIds : undefined}
            renderNode={(node, { selected }) => (
              <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <span className={cn('truncate', selected && 'font-medium')}>
                  {getLabel(node.data)}
                </span>
                {selected ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
              </div>
            )}
          />
        )}
      </div>
    </PopoverContent>
  );
}

export function TreePicker<T>({
  nodes,
  getLabel,
  selectedId = null,
  onSelect,
  onCreate,
  placeholder = 'Search…',
  trigger,
  triggerLabel,
  disabled,
  className,
}: TreePickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return nodes;
    const needle = query.toLowerCase();
    return filterNodes(nodes, (d) => getLabel(d).toLowerCase().includes(needle));
  }, [nodes, query, getLabel]);

  const expandedIds = useMemo(() => {
    if (query.trim()) return collectIds(filtered);
    return new Set<string>();
  }, [filtered, query]);

  const handleSelect = useCallback(
    (node: TreeNode<T>) => {
      onSelect(node);
      setOpen(false);
      setQuery('');
    },
    [onSelect]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={disabled} className={className}>
            {triggerLabel ?? 'Select…'}
          </Button>
        )}
      </PopoverTrigger>
      <PickerBody
        query={query}
        setQuery={setQuery}
        placeholder={placeholder}
        filtered={filtered}
        expandedIds={expandedIds}
        onCreate={onCreate}
        selectedId={selectedId}
        onSelect={handleSelect}
        getLabel={getLabel}
      />
    </Popover>
  );
}
