/**
 * ComboboxSelect - Advanced select with filtering using shadcn primitives
 * Built on Popover + Command for proper positioning and filtering
 */
import { useState } from 'react';

import { cn } from '../lib/utils';
import { ComboboxPopover, SelectedChips } from './ComboboxSelect.popover';

export interface ComboboxOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface ComboboxSelectProps {
  options: ComboboxOption[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

function getSelectedValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function getDisplayText(
  multiple: boolean,
  selectedValues: string[],
  getOptionLabel: (v: string) => string,
  placeholder: string
): string {
  if (multiple) {
    return selectedValues.length > 0 ? `${selectedValues.length} selected` : placeholder;
  }
  return selectedValues.length > 0 ? getOptionLabel(selectedValues[0] ?? '') : placeholder;
}

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
  const selectedValues = getSelectedValues(value);
  const getOptionLabel = (val: string): string =>
    options.find((opt) => opt.value === val)?.label ?? val;

  const toggleOption = (optionValue: string) => {
    if (multiple) {
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange?.(newValues);
      return;
    }
    onChange?.(optionValue);
    setOpen(false);
  };

  const removeValue = (optionValue: string) => {
    if (!multiple) return;
    onChange?.(selectedValues.filter((v) => v !== optionValue));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ComboboxPopover
        open={open}
        setOpen={setOpen}
        options={options}
        selectedValues={selectedValues}
        multiple={multiple}
        variant={variant}
        size={size}
        disabled={disabled}
        displayText={getDisplayText(multiple, selectedValues, getOptionLabel, placeholder)}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        className={className}
        onToggle={toggleOption}
      />
      {multiple && selectedValues.length > 0 && (
        <SelectedChips values={selectedValues} getLabel={getOptionLabel} onRemove={removeValue} />
      )}
    </div>
  );
}
