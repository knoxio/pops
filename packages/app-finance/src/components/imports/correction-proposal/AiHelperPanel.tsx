import { Sparkles } from 'lucide-react';

import { Button, Input } from '@pops/ui';

import type { AiMessage } from './types';

export function AiHelperPanel(props: {
  messages: AiMessage[];
  instruction: string;
  onInstructionChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t bg-muted/20 px-6 py-3 space-y-2 max-h-48 flex flex-col">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        AI helper
      </div>
      {props.messages.length > 0 && (
        <div className="flex-1 overflow-auto space-y-1.5 max-h-24">
          {props.messages.map((m) => (
            <div
              key={m.id}
              className={`text-xs ${
                m.role === 'user' ? 'text-foreground' : 'text-muted-foreground italic'
              }`}
            >
              <span className="font-semibold mr-1">{m.role === 'user' ? 'You:' : 'AI:'}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={props.instruction}
          onChange={(e) => {
            props.onInstructionChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              props.onSubmit();
            }
          }}
          placeholder="e.g. split location into its own rule, or exclude transfers"
          disabled={props.busy}
          className="flex-1"
        />
        <Button onClick={props.onSubmit} disabled={props.busy || !props.instruction.trim()}>
          {props.busy ? '…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
