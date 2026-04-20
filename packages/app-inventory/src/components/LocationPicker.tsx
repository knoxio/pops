import { MapPin } from 'lucide-react';
import { forwardRef, useCallback, useMemo, useState } from 'react';

import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { PickerFooter } from './location-picker/PickerFooter';
import { TreeNode } from './location-picker/TreeNode';
import { buildPath, filterTree, type LocationTreeNode } from './location-picker/utils';

export type { LocationTreeNode };

export interface LocationPickerProps {
  value?: string | null;
  onChange?: (locationId: string | null) => void;
  locations: LocationTreeNode[];
  onCreateLocation?: (name: string, parentId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface PickerTriggerProps {
  selectedPath: LocationTreeNode[];
  placeholder: string;
  open: boolean;
  disabled: boolean;
  className?: string;
  hasValue: boolean;
}

const PickerTrigger = forwardRef<HTMLButtonElement, PickerTriggerProps>(function PickerTrigger(
  { selectedPath, placeholder, open, disabled, className, hasValue, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className={cn(
        'w-full justify-start text-left font-normal h-9',
        !hasValue && 'text-muted-foreground',
        className
      )}
      {...props}
    >
      <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      {selectedPath.length > 0 ? (
        <span className="truncate text-sm">{selectedPath.map((n) => n.name).join(' › ')}</span>
      ) : (
        <span className="text-sm">{placeholder}</span>
      )}
    </Button>
  );
});

function SearchInput({ search, onChange }: { search: string; onChange: (v: string) => void }) {
  return (
    <div className="border-b px-3 py-2">
      <input
        type="text"
        placeholder="Search locations…"
        value={search}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function useLocationPickerState(value: string | null | undefined, locations: LocationTreeNode[]) {
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const selectedPath = useMemo(
    () => (value ? buildPath(locations, value) : []),
    [locations, value]
  );
  const visibleIds = useMemo(
    () => (search.trim() ? filterTree(locations, search.trim()) : null),
    [locations, search]
  );
  const effectiveExpanded = useMemo(() => visibleIds ?? expandedIds, [visibleIds, expandedIds]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { search, setSearch, selectedPath, visibleIds, effectiveExpanded, handleToggle };
}

interface LocationListProps {
  locations: LocationTreeNode[];
  value?: string | null;
  effectiveExpanded: Set<string>;
  visibleIds: Set<string> | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

function LocationList({
  locations,
  value,
  effectiveExpanded,
  visibleIds,
  onToggle,
  onSelect,
}: LocationListProps) {
  if (locations.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No locations found</p>;
  }
  return (
    <>
      {locations.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={value ?? null}
          expandedIds={effectiveExpanded}
          visibleIds={visibleIds}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
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
  const { search, setSearch, selectedPath, visibleIds, effectiveExpanded, handleToggle } =
    useLocationPickerState(value, locations);

  const handleSelect = useCallback(
    (id: string) => {
      onChange?.(id);
      setOpen(false);
      setSearch('');
    },
    [onChange, setSearch]
  );
  const handleClear = useCallback(() => {
    onChange?.(null);
    setOpen(false);
    setSearch('');
  }, [onChange, setSearch]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          selectedPath={selectedPath}
          placeholder={placeholder}
          open={open}
          disabled={disabled}
          className={className}
          hasValue={!!value}
        />
      </PopoverTrigger>
      <PopoverContent className="w-70 p-0" align="start">
        <SearchInput search={search} onChange={setSearch} />
        <div className="max-h-60 overflow-y-auto p-1">
          <LocationList
            locations={locations}
            value={value}
            effectiveExpanded={effectiveExpanded}
            visibleIds={visibleIds}
            onToggle={handleToggle}
            onSelect={handleSelect}
          />
        </div>
        <PickerFooter
          value={value}
          canCreate={!!onCreateLocation}
          onClear={handleClear}
          onCreateLocation={(name) => onCreateLocation?.(name, value ?? null)}
        />
      </PopoverContent>
    </Popover>
  );
}

LocationPicker.displayName = 'LocationPicker';
