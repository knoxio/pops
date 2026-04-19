import { Select, Skeleton } from '@pops/ui';

import type { Dimension } from './types';

interface ArenaDimensionPickerProps {
  loading: boolean;
  activeDimensions: Dimension[];
  dimensionId: number | null;
  onChange: (id: number) => void;
}

export function ArenaDimensionPicker({
  loading,
  activeDimensions,
  dimensionId,
  onChange,
}: ArenaDimensionPickerProps) {
  if (loading) return <Skeleton className="h-11 w-48" />;
  if (activeDimensions.length === 0) {
    return <p className="text-muted-foreground text-sm">No dimensions configured yet.</p>;
  }

  return (
    <Select
      value={String(dimensionId ?? '')}
      onChange={(e) => onChange(Number(e.target.value))}
      options={activeDimensions.map((dim) => ({ value: String(dim.id), label: dim.name }))}
      variant="ghost"
      size="sm"
      containerClassName="w-auto"
      aria-label="Comparison dimension"
    />
  );
}
