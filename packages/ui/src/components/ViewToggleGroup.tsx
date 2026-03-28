/**
 * ViewToggleGroup — segmented button toggle for switching between views
 * (e.g. table/grid). Persists selection to localStorage via storageKey.
 */
import { useState, useCallback, type ReactNode } from "react";
import { cn } from "../lib/utils";

export interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

export interface ViewToggleGroupProps<T extends string> {
  options: ViewToggleOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** localStorage key for persisting selection */
  storageKey?: string;
  className?: string;
}

function getStoredValue<T extends string>(
  storageKey: string | undefined,
  validValues: T[],
): T | undefined {
  if (!storageKey) return undefined;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored && validValues.includes(stored as T)) return stored as T;
  } catch {
    // SSR or no localStorage
  }
  return undefined;
}

export function ViewToggleGroup<T extends string>({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  storageKey,
  className,
}: ViewToggleGroupProps<T>) {
  const validValues = options.map((o) => o.value);
  const initialValue =
    controlledValue ??
    getStoredValue(storageKey, validValues) ??
    defaultValue ??
    options[0]?.value;

  const [internalValue, setInternalValue] = useState<T>(initialValue as T);
  const isControlled = controlledValue !== undefined;
  const activeValue = isControlled ? controlledValue : internalValue;

  const handleChange = useCallback(
    (newValue: T) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, newValue);
        } catch {
          // localStorage full or unavailable
        }
      }
      onChange?.(newValue);
    },
    [isControlled, storageKey, onChange],
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted p-1",
        className,
      )}
      role="radiogroup"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={activeValue === option.value}
          aria-label={option.label}
          onClick={() => handleChange(option.value)}
          className={cn(
            "flex items-center justify-center rounded-md p-1.5 min-h-8 min-w-8 transition-all",
            activeValue === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
