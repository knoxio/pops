import { History } from 'lucide-react';
import { Link } from 'react-router';

import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import { DimensionManager } from '../../components/DimensionManager';

interface ArenaHeaderProps {
  sessionCount: number;
}

export function ArenaHeader({ sessionCount }: ArenaHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Arena</h1>
        {sessionCount > 0 && (
          <Badge variant="outline" className="text-xs tabular-nums">
            {sessionCount}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" aria-label="Comparison history">
              <Link to="/media/compare/history">
                <History className="h-4.5 w-4.5" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>History</TooltipContent>
        </Tooltip>
        <DimensionManager />
      </div>
    </div>
  );
}
