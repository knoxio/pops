import { type MutableRefObject, useEffect, useRef, useState } from 'react';

interface UseDragListenersArgs {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  step: number;
  dragStartY: MutableRefObject<number>;
  dragStartValue: MutableRefObject<number>;
  commitValue: (v: number) => void;
}

function useDragListeners({
  isDragging,
  setIsDragging,
  step,
  dragStartY,
  dragStartValue,
  commitValue,
}: UseDragListenersArgs) {
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY.current - e.clientY;
      const deltaValue = Math.round(deltaY / 2) * step;
      commitValue(dragStartValue.current + deltaValue);
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, step]);
}

export interface UseNumberInputArgs {
  controlledValue: number | string | readonly string[] | undefined;
  defaultValue: number | string | readonly string[] | undefined;
  min?: number;
  max?: number;
  step: number;
  enableDrag: boolean;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function clamp(val: number, min?: number, max?: number): number {
  if (min !== undefined && val < min) return min;
  if (max !== undefined && val > max) return max;
  return val;
}

function makeSyntheticChange(value: number): React.ChangeEvent<HTMLInputElement> {
  return { target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>;
}

export function useNumberInput({
  controlledValue,
  defaultValue,
  min,
  max,
  step,
  enableDrag,
  disabled,
  onChange,
}: UseNumberInputArgs) {
  const [internalValue, setInternalValue] = useState<number>(Number(defaultValue) || 0);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number>(0);
  const dragStartValue = useRef<number>(0);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? Number(controlledValue) : internalValue;

  const commitValue = (next: number, e?: React.ChangeEvent<HTMLInputElement>) => {
    const clamped = clamp(next, min, max);
    if (!isControlled) setInternalValue(clamped);
    onChange?.(e ?? makeSyntheticChange(clamped));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    if (!isNaN(newValue)) commitValue(newValue, e);
  };

  const increment = () => commitValue(value + step);
  const decrement = () => commitValue(value - step);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!enableDrag || disabled) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartValue.current = value;
  };

  useDragListeners({
    isDragging,
    setIsDragging,
    step,
    dragStartY,
    dragStartValue,
    commitValue,
  });

  return {
    value,
    isFocused,
    setIsFocused,
    handleChange,
    increment,
    decrement,
    handleMouseDown,
    decrementDisabled: disabled ?? (min !== undefined && value <= min),
    incrementDisabled: disabled ?? (max !== undefined && value >= max),
  };
}
