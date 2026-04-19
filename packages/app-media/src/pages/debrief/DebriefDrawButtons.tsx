import { ChevronDown, ChevronUp, Minus } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import type { DrawTier } from '../compare-arena/types';

interface DebriefDrawButtonsProps {
  onDraw: (tier: DrawTier) => void;
  disabled: boolean;
}

const DRAW_TIERS = [
  {
    tier: 'high' as const,
    icon: ChevronUp,
    label: 'Equally great',
    color: 'hover:border-success hover:text-success',
  },
  {
    tier: 'mid' as const,
    icon: Minus,
    label: 'Equally average',
    color: 'hover:border-muted-foreground',
  },
  {
    tier: 'low' as const,
    icon: ChevronDown,
    label: 'Equally poor',
    color: 'hover:border-destructive hover:text-destructive',
  },
] as const;

export function DebriefDrawButtons({ onDraw, disabled }: DebriefDrawButtonsProps) {
  return (
    <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5">
      {DRAW_TIERS.map(({ tier, icon: Icon, label, color }) => (
        <Tooltip key={tier}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDraw(tier)}
              disabled={disabled}
              className={`bg-background h-10 w-10 rounded-full shadow-lg hover:scale-110 hover:shadow-xl active:scale-95 ${color}`}
              aria-label={label}
              data-testid={`draw-${tier}`}
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
