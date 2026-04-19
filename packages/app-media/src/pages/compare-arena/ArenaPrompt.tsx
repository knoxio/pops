import { Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

interface ArenaPromptProps {
  dimensionName: string;
  dimensionDescription: string | null;
}

export function ArenaPrompt({ dimensionName, dimensionDescription }: ArenaPromptProps) {
  return (
    <p className="text-center text-muted-foreground text-sm">
      Which movie has better{' '}
      {dimensionDescription ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-medium text-foreground underline decoration-dotted cursor-help">
              {dimensionName}
            </span>
          </TooltipTrigger>
          <TooltipContent>{dimensionDescription}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="font-medium text-foreground">{dimensionName}</span>
      )}
      ?
    </p>
  );
}
