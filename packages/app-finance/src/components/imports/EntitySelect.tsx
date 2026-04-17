import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

export interface EntityOption {
  id: string;
  name: string;
  type: string;
}

export interface EntitySelectProps {
  entities: EntityOption[];
  value?: string;
  onChange?: (entityId: string, entityName: string) => void;
  placeholder?: string;
}

export function EntitySelect({
  entities,
  value,
  onChange,
  placeholder = 'Choose existing entity...',
}: EntitySelectProps) {
  const [open, setOpen] = useState(false);

  const selected = entities.find((e) => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{selected.name}</span>
              <Badge variant="outline" className="text-xs capitalize shrink-0">
                {selected.type}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search entities..." />
          <CommandList>
            <CommandEmpty>No entities found.</CommandEmpty>
            <CommandGroup>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  value={`${entity.name} ${entity.type}`}
                  onSelect={() => {
                    onChange?.(entity.id, entity.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value === entity.id ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <span
                    className={`truncate ${entity.id.startsWith('temp:entity:') ? 'italic' : ''}`}
                  >
                    {entity.name}
                  </span>
                  {entity.id.startsWith('temp:entity:') && (
                    <Badge variant="secondary" className="ml-1 text-xs shrink-0">
                      Pending
                    </Badge>
                  )}
                  <Badge variant="outline" className="ml-auto text-xs capitalize shrink-0">
                    {entity.type}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
