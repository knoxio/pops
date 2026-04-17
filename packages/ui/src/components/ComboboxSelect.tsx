/**
 * ComboboxSelect - Advanced select with filtering using shadcn primitives
 * Built on Popover + Command for proper positioning and filtering
 */
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

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

export interface ComboboxOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface ComboboxSelectProps {
  /**
   * Available options
   */
  options: ComboboxOption[];
  /**
   * Selected value(s) - string for single, array for multi
   */
  value?: string | string[];
  /**
   * Callback when selection changes
   */
  onChange?: (value: string | string[]) => void;
  /**
   * Enable multi-select mode
   */
  multiple?: boolean;
  /**
   * Placeholder text
   */
  placeholder?: string;
  /**
   * Search placeholder
   */
  searchPlaceholder?: string;
  /**
   * Empty message
   */
  emptyMessage?: string;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Button variant
   */
  variant?: 'default' | 'outline' | 'ghost';
  /**
   * Button size
   */
  size?: 'default' | 'sm' | 'lg';
  /**
   * Container className
   */
  className?: string;
}

/**
 * ComboboxSelect component
 *
 * @example
 * ```tsx
 * // Single select
 * <ComboboxSelect
 *   options={options}
 *   value={selected}
 *   onChange={setSelected}
 *   placeholder="Select..."
 * />
 *
 * // Multi-select with chips
 * <ComboboxSelect
 *   options={options}
 *   value={selected}
 *   onChange={setSelected}
 *   multiple
 *   placeholder="Select multiple..."
 * />
 * ```
 */
export function ComboboxSelect({
  options,
  value,
  onChange,
  multiple = false,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found.',
  disabled = false,
  variant = 'outline',
  size = 'default',
  className,
}: ComboboxSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  const toggleOption = (optionValue: string) => {
    if (multiple) {
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange?.(newValues);
    } else {
      onChange?.(optionValue);
      setOpen(false);
    }
  };

  const removeValue = (optionValue: string) => {
    if (!multiple) return;
    const newValues = selectedValues.filter((v) => v !== optionValue);
    onChange?.(newValues);
  };

  const getOptionLabel = (val: string): string => {
    return options.find((opt) => opt.value === val)?.label ?? val;
  };

  const displayText = multiple
    ? selectedValues.length > 0
      ? `${selectedValues.length} selected`
      : placeholder
    : selectedValues.length > 0
      ? getOptionLabel(selectedValues[0]!)
      : placeholder;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
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
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedValues.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        if (!option.disabled) toggleOption(option.value);
                      }}
                      disabled={option.disabled}
                    >
                      {multiple && (
                        <Check
                          className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')}
                        />
                      )}
                      {option.label}
                      {!multiple && isSelected && <Check className="ml-auto h-4 w-4" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {multiple && selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedValues.map((val) => (
            <Chip
              key={val}
              variant="default"
              size="sm"
              removable
              onRemove={() => {
                removeValue(val);
              }}
            >
              {getOptionLabel(val)}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
