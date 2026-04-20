import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import {
  FollowUpNotice,
  FormFields,
  ImpactPreview,
  NewTagsPanel,
  RejectPanel,
} from './tag-rule-dialog/DialogBody';
import { useTagRuleProposal } from './tag-rule-dialog/useTagRuleProposal';

import type {
  ProposeOutput,
  TagRuleLearnSignal,
  TagRuleProposalDialogProps,
} from './tag-rule-dialog/types';

export type { TagRuleLearnSignal, TagRuleProposalDialogProps };

interface DialogFooterProps {
  busy: boolean;
  proposal: ProposeOutput | undefined;
  rejectOpen: boolean;
  setRejectOpen: (v: boolean) => void;
  onCancel: () => void;
  onApply: () => void;
  onReject: () => void;
}

function DialogActions(props: DialogFooterProps) {
  return (
    <DialogFooter className="gap-2 sm:gap-0">
      <Button type="button" variant="outline" onClick={props.onCancel} disabled={props.busy}>
        Cancel
      </Button>
      {!props.rejectOpen ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => props.setRejectOpen(true)}
          disabled={props.busy || !props.proposal}
        >
          Reject…
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={props.onReject}
          disabled={props.busy}
        >
          Confirm reject
        </Button>
      )}
      <Button type="button" onClick={props.onApply} disabled={props.busy || !props.proposal}>
        {props.busy ? 'Saving…' : 'Save rule'}
      </Button>
    </DialogFooter>
  );
}

interface BodyProps {
  state: ReturnType<typeof useTagRuleProposal>;
}

function DialogContentBody({ state }: BodyProps) {
  const { form, proposal, proposeQuery, newTagNames } = state;
  return (
    <div className="space-y-4 text-sm">
      <FollowUpNotice visible={Boolean(form.followUpProposal)} />
      <FormFields
        pattern={form.pattern}
        matchType={form.matchType}
        tagsText={form.tagsText}
        setPattern={form.setPattern}
        setMatchType={form.setMatchType}
        setTagsText={form.setTagsText}
      />
      {proposeQuery.isLoading && <p className="text-muted-foreground">Generating preview…</p>}
      {proposeQuery.isError && (
        <p className="text-destructive text-xs">{proposeQuery.error.message}</p>
      )}
      {proposal && (
        <>
          <ImpactPreview proposal={proposal} />
          <NewTagsPanel
            newTagNames={newTagNames}
            acceptedNewTags={form.acceptedNewTags}
            setAcceptedNewTags={form.setAcceptedNewTags}
          />
        </>
      )}
      <RejectPanel
        open={form.rejectOpen}
        rejectFeedback={form.rejectFeedback}
        setRejectFeedback={form.setRejectFeedback}
      />
    </div>
  );
}

export function TagRuleProposalDialog(props: TagRuleProposalDialogProps) {
  const state = useTagRuleProposal(props);
  const { form, proposal, busy, handleApply, handleReject } = state;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save tag rule</DialogTitle>
          <DialogDescription>
            Create a reusable tag rule from this group. Rules apply as <strong>suggestions</strong>{' '}
            on future imports and never overwrite tags you set manually.
          </DialogDescription>
        </DialogHeader>
        {props.signal && <DialogContentBody state={state} />}
        <DialogActions
          busy={busy}
          proposal={proposal}
          rejectOpen={form.rejectOpen}
          setRejectOpen={form.setRejectOpen}
          onCancel={() => props.onOpenChange(false)}
          onApply={handleApply}
          onReject={handleReject}
        />
      </DialogContent>
    </Dialog>
  );
}
