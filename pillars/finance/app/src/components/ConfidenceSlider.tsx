import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Slider, useDebouncedCallback } from '@pops/ui';

import { unwrap } from '../finance-api-helpers.js';
import { correctionsAdjustConfidence } from '../finance-api/index.js';

interface ConfidenceSliderProps {
  ruleId: string;
  initial: number;
  onAutoDelete: (id: string) => void;
}

interface AdjustConfidenceInput {
  id: string;
  delta: number;
}

export function ConfidenceSlider({ ruleId, initial, onAutoDelete }: ConfidenceSliderProps) {
  const [value, setValue] = useState(initial);
  const initialRef = useRef(initial);
  const queryClient = useQueryClient();

  // Keep initialRef in sync when the prop changes (e.g. after query invalidation)
  useEffect(() => {
    initialRef.current = initial;
    setValue(initial);
  }, [initial]);

  const adjustMutation = useMutation({
    mutationFn: async (vars: AdjustConfidenceInput) =>
      unwrap(
        await correctionsAdjustConfidence({ path: { id: vars.id }, body: { delta: vars.delta } })
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'corrections', 'list'] });
    },
  });

  const commit = useCallback(
    (newValue: number) => {
      const delta = newValue - initialRef.current;
      if (Math.abs(delta) < 0.001) return;
      adjustMutation.mutate(
        { id: ruleId, delta },
        {
          onSuccess: () => {
            if (newValue < 0.3) {
              onAutoDelete(ruleId);
            }
          },
        }
      );
    },
    [ruleId, adjustMutation, onAutoDelete]
  );

  const debouncedCommit = useDebouncedCallback(commit, 400);

  const handleChange = (values: number[]) => {
    const next = values[0] ?? value;
    setValue(next);
    debouncedCommit(next);
  };

  return (
    <div className="flex items-center gap-2 min-w-36">
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        onValueChange={handleChange}
        className="w-20"
        aria-label={`Confidence for rule ${ruleId}`}
      />
      <span className="text-xs tabular-nums w-10 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}
