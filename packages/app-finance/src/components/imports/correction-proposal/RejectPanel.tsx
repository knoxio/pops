import { Button, Textarea } from '@pops/ui';

export function RejectPanel(props: {
  feedback: string;
  onFeedbackChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t bg-destructive/5 px-6 py-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
        Reject with feedback
      </div>
      <div className="text-xs text-muted-foreground">
        Reject is the escape hatch for "this whole direction is wrong". For day-to-day refinement,
        edit operations in place or use the AI helper.
      </div>
      <Textarea
        value={props.feedback}
        onChange={(e) => {
          props.onFeedbackChange(e.target.value);
        }}
        placeholder="Why is this proposal wrong?"
        rows={2}
        disabled={props.busy}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={props.onConfirm}
          disabled={props.busy || !props.feedback.trim()}
        >
          {props.busy ? 'Rejecting…' : 'Confirm reject'}
        </Button>
      </div>
    </div>
  );
}
