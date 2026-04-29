/**
 * RuleFormDialog — manual create/edit surface for AI categorisation rules.
 *
 * Closes #2187 and unblocks the e2e flows in #2119 / #2135. The dialog
 * mirrors `EntityFormDialog`'s shape (Controller for ChipInput / boolean
 * toggle, register for TextInput) and adds a side preview pane showing the
 * transactions the candidate (pattern, matchType) would match against the
 * live transactions table.
 */
import { Loader2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  Button,
  CheckboxInput,
  ChipInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntitySelect,
  type EntityOption,
  Label,
  NumberInput,
  Select,
  TextInput,
} from '@pops/ui';

import { RulePreviewPanel, type RulePreviewPanelProps } from './RulePreviewPanel';
import { MATCH_TYPE_OPTIONS, type RuleFormValues } from './types';

import type { Correction } from '../types';

interface RuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule: Correction | null;
  form: UseFormReturn<RuleFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: RuleFormValues) => void;
  preview: RulePreviewPanelProps['preview'];
  entities: EntityOption[];
}

function PriorityField({ form }: { form: UseFormReturn<RuleFormValues> }) {
  return (
    <Controller
      control={form.control}
      name="priority"
      render={({ field }) => (
        <div className="flex flex-col gap-1.5 w-full">
          <Label>Priority</Label>
          <NumberInput
            min={0}
            value={field.value}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              field.onChange(Number.isFinite(next) ? next : 0);
            }}
            aria-label="Priority"
          />
        </div>
      )}
    />
  );
}

function EntityField({
  form,
  entities,
}: {
  form: UseFormReturn<RuleFormValues>;
  entities: EntityOption[];
}) {
  return (
    <Controller
      control={form.control}
      name="entityId"
      render={({ field }) => (
        <div className="flex flex-col gap-1.5 w-full">
          <Label>Entity</Label>
          <EntitySelect
            entities={entities}
            value={field.value ?? undefined}
            onChange={(id) => field.onChange(id)}
            placeholder="Choose entity..."
          />
        </div>
      )}
    />
  );
}

function PatternAndType({
  form,
  entities,
}: {
  form: UseFormReturn<RuleFormValues>;
  entities: EntityOption[];
}) {
  return (
    <>
      <TextInput
        label="Pattern"
        placeholder="e.g. WOOLWORTHS"
        {...form.register('descriptionPattern')}
        error={form.formState.errors.descriptionPattern?.message}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Match Type"
          options={MATCH_TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          {...form.register('matchType')}
        />
        <PriorityField form={form} />
      </div>
      <EntityField form={form} entities={entities} />
    </>
  );
}

function TagsAndActive({ form }: { form: UseFormReturn<RuleFormValues> }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Tags</Label>
        <Controller
          control={form.control}
          name="tags"
          render={({ field }) => (
            <ChipInput
              placeholder="Type and press Enter..."
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <CheckboxInput
            label="Active"
            description="Inactive rules are skipped by the matcher."
            checked={field.value}
            onCheckedChange={(checked) => field.onChange(Boolean(checked))}
          />
        )}
      />
    </>
  );
}

function DialogActions({
  editingRule,
  isSubmitting,
  onCancel,
}: {
  editingRule: Correction | null;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {editingRule ? 'Update' : 'Create'}
      </Button>
    </DialogFooter>
  );
}

export function RuleFormDialog(props: RuleFormDialogProps) {
  const { open, onOpenChange, editingRule, form, isSubmitting, onSubmit, preview, entities } =
    props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-4xl">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'New Rule'}</DialogTitle>
            <DialogDescription className="sr-only">
              Define the pattern and settings for this categorisation rule
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4 md:grid-cols-2">
            <div className="grid gap-4 min-w-0">
              <PatternAndType form={form} entities={entities} />
              <TagsAndActive form={form} />
            </div>
            <RulePreviewPanel preview={preview} />
          </div>
          <DialogActions
            editingRule={editingRule}
            isSubmitting={isSubmitting}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
