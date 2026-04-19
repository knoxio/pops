import { ChevronDown, ChevronUp, Minus, SkipForward } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

/**
 * DrawTierButtons — center column of the CompareArena grid.
 * Renders draw (high/mid/low) and skip actions between two movie cards.
 */
export interface DrawTierButtonsProps {
  onDraw: (tier: 'high' | 'mid' | 'low') => void;
  onSkip: () => void;
  disabled: boolean;
  skipPending: boolean;
}

const DRAW_TIERS = [
  {
    tier: 'high' as const,
    icon: ChevronUp,
    label: 'Equally great',
    hoverColor: 'hover:border-success hover:text-success',
  },
  {
    tier: 'mid' as const,
    icon: Minus,
    label: 'Equally average',
    hoverColor: 'hover:border-muted-foreground',
  },
  {
    tier: 'low' as const,
    icon: ChevronDown,
    label: 'Equally poor',
    hoverColor: 'hover:border-destructive hover:text-destructive',
  },
] as const;

export function DrawTierButtons({ onDraw, onSkip, disabled, skipPending }: DrawTierButtonsProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {DRAW_TIERS.map(({ tier, icon: Icon, label, hoverColor }) => (
        <Tooltip key={tier}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                onDraw(tier);
              }}
              disabled={disabled}
              className={`rounded-full h-10 w-10 bg-background ${hoverColor}`}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}

      <div className="w-5 border-t border-border my-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={onSkip}
            disabled={disabled || skipPending}
            className="rounded-full h-10 w-10 bg-background hover:border-muted-foreground"
            aria-label="Skip this pair"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Skip pair</TooltipContent>
      </Tooltip>
    </div>
  );
}
