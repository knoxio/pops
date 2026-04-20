import { Checkbox, Input, Label, Textarea } from '@pops/ui';

import type { ProposeOutput, TagRuleLearnSignal } from './types';

interface FormFieldsProps {
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tagsText: string;
  setPattern: (v: string) => void;
  setMatchType: (v: 'exact' | 'contains' | 'regex') => void;
  setTagsText: (v: string) => void;
}

export function FormFields(props: FormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="tr-pattern">Description pattern</Label>
        <Input
          id="tr-pattern"
          value={props.pattern}
          onChange={(e) => props.setPattern(e.target.value)}
          placeholder="e.g. WOOLWORTHS"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-match">Match type</Label>
        <select
          id="tr-match"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={props.matchType}
          onChange={(e) => props.setMatchType(e.target.value as 'exact' | 'contains' | 'regex')}
        >
          <option value="contains">Contains</option>
          <option value="exact">Exact</option>
          <option value="regex">Regex</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tr-tags">Tags (comma-separated)</Label>
        <Input
          id="tr-tags"
          value={props.tagsText}
          onChange={(e) => props.setTagsText(e.target.value)}
          placeholder="Groceries, Transport"
        />
      </div>
    </>
  );
}

export function ImpactPreview({ proposal }: { proposal: ProposeOutput }) {
  return (
    <>
      <p className="text-muted-foreground text-xs">{proposal.rationale}</p>
      <div className="rounded-md border p-3 space-y-1">
        <p className="font-medium text-xs">Impact preview</p>
        <p className="text-xs text-muted-foreground">
          {proposal.preview.counts.affected} matching row
          {proposal.preview.counts.affected === 1 ? '' : 's'} in this import would receive tag
          suggestions (simulated without per-row tag locks).
        </p>
        <ul className="text-xs max-h-28 overflow-y-auto space-y-0.5 font-mono">
          {proposal.preview.affected.slice(0, 12).map((a) => (
            <li key={a.transactionId} className="truncate" title={a.description}>
              {a.description.slice(0, 56)}
              {a.description.length > 56 ? '…' : ''}
            </li>
          ))}
        </ul>
        {proposal.preview.affected.length > 12 && (
          <p className="text-xs text-muted-foreground">
            +{proposal.preview.affected.length - 12} more
          </p>
        )}
      </div>
    </>
  );
}

export function NewTagsPanel({
  newTagNames,
  acceptedNewTags,
  setAcceptedNewTags,
}: {
  newTagNames: string[];
  acceptedNewTags: Set<string>;
  setAcceptedNewTags: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  if (newTagNames.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">New vocabulary tags — accept before saving</p>
      <div className="space-y-2">
        {newTagNames.map((tag) => (
          <label key={tag} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={acceptedNewTags.has(tag)}
              onCheckedChange={(v) =>
                setAcceptedNewTags((prev) => {
                  const next = new Set(prev);
                  if (v === true) next.add(tag);
                  else next.delete(tag);
                  return next;
                })
              }
            />
            <span>{tag}</span>
            <span className="text-muted-foreground">(new)</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function RejectPanel({
  open,
  rejectFeedback,
  setRejectFeedback,
}: {
  open: boolean;
  rejectFeedback: string;
  setRejectFeedback: (v: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="tr-reject">Feedback (required)</Label>
      <Textarea
        id="tr-reject"
        value={rejectFeedback}
        onChange={(e) => setRejectFeedback(e.target.value)}
        rows={3}
        placeholder="What should change about this rule?"
      />
    </div>
  );
}

export function FollowUpNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      Revised proposal based on your feedback. Review and save or dismiss.
    </p>
  );
}

export type { TagRuleLearnSignal };
