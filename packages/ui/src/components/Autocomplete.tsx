/**
 * Autocomplete component - Text input with suggestions using shadcn primitives
 * Built on Popover + Command for proper positioning and filtering
 */
import { useEffect, useRef, useState } from 'react';

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

export interface AutocompleteSuggestion {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface AutocompleteProps {
  /**
   * Available suggestions
   */
  suggestions: AutocompleteSuggestion[];
  /**
   * Current value
   */
  value?: string;
  /**
   * Callback when value changes
   */
  onChange?: (value: string) => void;
  /**
   * Callback when a suggestion is selected
   */
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
  /**
   * Placeholder text
   */
  placeholder?: string;
  /**
   * Empty message
   */
  emptyMessage?: string;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Container className
   */
  className?: string;
}

/**
 * Autocomplete component
 *
 * @example
 * ```tsx
 * <Autocomplete
 *   suggestions={suggestions}
 *   value={value}
 *   onChange={setValue}
 *   onSelect={(item) => console.log(item)}
 *   placeholder="Start typing..."
 * />
 * ```
 */
export function Autocomplete({
  suggestions,
  value = '',
  onChange,
  onSelect,
  placeholder = 'Search...',
  emptyMessage = 'No results found.',
  disabled = false,
  className,
}: AutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
    onChange?.(newValue);
    if (!open && newValue) {
      setOpen(true);
    }
  };

  const handleSelect = (suggestion: AutocompleteSuggestion) => {
    setInputValue(suggestion.label);
    onChange?.(suggestion.label);
    onSelect?.(suggestion);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command className={cn('overflow-visible bg-transparent', className)}>
        <PopoverTrigger asChild>
          <CommandInput
            ref={inputRef}
            value={inputValue}
            onValueChange={handleInputChange}
            onFocus={() => inputValue && setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="h-10"
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e: Event) => {
            e.preventDefault();
          }}
        >
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {suggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion.value}
                  value={suggestion.label}
                  onSelect={() => {
                    if (!suggestion.disabled) handleSelect(suggestion);
                  }}
                  disabled={suggestion.disabled}
                >
                  <div className="flex flex-col">
                    <span>{suggestion.label}</span>
                    {suggestion.description && (
                      <span className="text-xs text-muted-foreground">
                        {suggestion.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
