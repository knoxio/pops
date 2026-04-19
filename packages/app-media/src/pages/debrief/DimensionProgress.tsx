import { CheckCircle, Circle } from 'lucide-react';

import { Badge } from '@pops/ui';

import type { DebriefDimension } from './types';

interface DimensionProgressProps {
  dimensions: DebriefDimension[];
  currentDimensionId: number | null;
}

export function DimensionProgress({ dimensions, currentDimensionId }: DimensionProgressProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="dimension-progress">
      {dimensions.map((dim) => (
        <Badge
          key={dim.dimensionId}
          variant={
            dim.status === 'complete'
              ? 'default'
              : currentDimensionId === dim.dimensionId
                ? 'outline'
                : 'secondary'
          }
          className="gap-1"
        >
          {dim.status === 'complete' ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <Circle className="h-3 w-3" />
          )}
          {dim.name}
        </Badge>
      ))}
    </div>
  );
}
