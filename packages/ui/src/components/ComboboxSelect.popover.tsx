import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '../lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../primitives/command';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { Button } from './Button';
import { Chip } from './Chip';

import type { ComboboxOption, ComboboxSelectProps } from './ComboboxSelect';

interface OptionListProps {
  options: ComboboxOption[];
  selectedValues: string[];
  multiple: boolean;
  onToggle: (optionValue: string) => void;
}

export function OptionList({ options, selectedValues, multiple, onToggle }: OptionListProps) {
  return (
    <CommandGroup>
      {options.map((option) => {
        const isSelected = selectedValues.includes(option.value);
        return (
          <CommandItem
            key={option.value}
            value={option.value}
            onSelect={() => {
              if (!option.disabled) onToggle(option.value);
            }}
            disabled={option.disabled}
          >
            {multiple && (
              <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
            )}
            {option.label}
            {!multiple && isSelected && <Check className="ml-auto h-4 w-4" />}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

export function SelectedChips({
  values,
  getLabel,
  onRemove,
}: {
  values: string[];
  getLabel: (v: string) => string;
  onRemove: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((val) => (
        <Chip key={val} variant="default" size="sm" removable onRemove={() => onRemove(val)}>
          {getLabel(val)}
        </Chip>
      ))}
    </div>
  );
}

export interface ComboboxPopoverProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  options: ComboboxOption[];
  selectedValues: string[];
  multiple: boolean;
  variant: NonNullable<ComboboxSelectProps['variant']>;
  size: NonNullable<ComboboxSelectProps['size']>;
  disabled: boolean;
  displayText: string;
  searchPlaceholder: string;
  emptyMessage: string;
  className?: string;
  onToggle: (v: string) => void;
}

export function ComboboxPopover({
  open,
  setOpen,
  options,
  selectedValues,
  multiple,
  variant,
  size,
  disabled,
  displayText,
  searchPlaceholder,
  emptyMessage,
  className,
  onToggle,
}: ComboboxPopoverProps) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size={size}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('justify-between', className)}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <OptionList
              options={options}
              selectedValues={selectedValues}
              multiple={multiple}
              onToggle={onToggle}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
