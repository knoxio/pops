/**
 * LocationPicker — tree-based location selector with search and inline add.
 * Shows trigger button with breadcrumb path, opens popover with expandable
 * location tree, type-to-filter, and optional inline create.
 */
import { cn, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';
import { Button } from '@pops/ui';
import { ChevronDown, ChevronRight, MapPin, Plus, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export interface LocationTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children: LocationTreeNode[];
}

export interface LocationPickerProps {
  value?: string | null;
  onChange?: (locationId: string | null) => void;
  locations: LocationTreeNode[];
  onCreateLocation?: (name: string, parentId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Build breadcrumb path from root to target node. */
function buildPath(nodes: LocationTreeNode[], targetId: string): LocationTreeNode[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    const childPath = buildPath(node.children, targetId);
    if (childPath.length > 0) return [node, ...childPath];
  }
  return [];
}

/** Flatten tree for search, returning nodes that match filter. */
function filterTree(nodes: LocationTreeNode[], query: string): Set<string> {
  const matches = new Set<string>();
  const lower = query.toLowerCase();

  function walk(node: LocationTreeNode, ancestors: string[]) {
    const nameMatches = node.name.toLowerCase().includes(lower);
    const childMatches: boolean[] = [];

    for (const child of node.children) {
      walk(child, [...ancestors, node.id]);
      if (matches.has(child.id)) childMatches.push(true);
    }

    if (nameMatches || childMatches.length > 0) {
      matches.add(node.id);
      for (const aid of ancestors) matches.add(aid);
    }
  }

  for (const node of nodes) walk(node, []);
  return matches;
}

function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  visibleIds,
  onToggle,
  onSelect,
}: {
  node: LocationTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  visibleIds: Set<string> | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (visibleIds && !visibleIds.has(node.id)) return null;

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedId;

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm',
          'hover:bg-accent/50 transition-colors',
          isSelected && 'bg-accent text-accent-foreground font-medium'
        )}
        style={{
          paddingLeft: `calc(${depth} * var(--tree-picker-step) + var(--tree-indent-base))`,
        }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={-1}
            className="shrink-0 p-0.5 rounded hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onToggle(node.id);
              }
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              visibleIds={visibleIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationPicker({
  value,
  onChange,
  locations,
  onCreateLocation,
  placeholder = 'Select location…',
  disabled = false,
  className,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newLocationName, setNewLocationName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const selectedPath = useMemo(
    () => (value ? buildPath(locations, value) : []),
    [locations, value]
  );

  const visibleIds = useMemo(
    () => (search.trim() ? filterTree(locations, search.trim()) : null),
    [locations, search]
  );

  // Auto-expand matching nodes when searching
  const effectiveExpanded = useMemo(() => {
    if (visibleIds) return visibleIds;
    return expandedIds;
  }, [visibleIds, expandedIds]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onChange?.(id);
      setOpen(false);
      setSearch('');
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange?.(null);
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const handleAddLocation = useCallback(() => {
    const name = newLocationName.trim();
    if (!name || !onCreateLocation) return;
    onCreateLocation(name, value ?? null);
    setNewLocationName('');
    setShowAddForm(false);
  }, [newLocationName, onCreateLocation, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-9',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          {selectedPath.length > 0 ? (
            <span className="truncate text-sm">{selectedPath.map((n) => n.name).join(' › ')}</span>
          ) : (
            <span className="text-sm">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-70 p-0" align="start">
        {/* Search */}
        <div className="border-b px-3 py-2">
          <input
            type="text"
            placeholder="Search locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Tree */}
        <div className="max-h-60 overflow-y-auto p-1">
          {locations.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No locations found</p>
          ) : (
            locations.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedId={value ?? null}
                expandedIds={effectiveExpanded}
                visibleIds={visibleIds}
                onToggle={handleToggle}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {/* Footer: Clear + Add */}
        <div className="border-t p-2 flex flex-col gap-1">
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              prefix={<X className="h-3.5 w-3.5" />}
              onClick={handleClear}
            >
              Clear selection
            </Button>
          )}

          {onCreateLocation && !showAddForm && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              prefix={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setShowAddForm(true)}
            >
              Add location
            </Button>
          )}

          {onCreateLocation && showAddForm && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Location name…"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddLocation();
                  if (e.key === 'Escape') {
                    setShowAddForm(false);
                    setNewLocationName('');
                  }
                }}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <Button
                size="sm"
                variant="default"
                onClick={handleAddLocation}
                disabled={!newLocationName.trim()}
                className="h-7 px-2 text-xs"
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

LocationPicker.displayName = 'LocationPicker';
