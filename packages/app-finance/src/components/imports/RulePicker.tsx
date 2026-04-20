import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type CorrectionListOutput = inferRouterOutputs<AppRouter>['core']['corrections']['list'];
export type CorrectionRule = CorrectionListOutput['data'][number];

export interface RulePickerProps {
  /** Currently selected rule id, or null. */
  value: string | null;
  /** Called with the full rule object when the user picks one. */
  onChange: (rule: CorrectionRule) => void;
  /** Disable interaction (e.g. while the parent is saving). */
  disabled?: boolean;
  placeholder?: string;
  /** Exclude rule ids from the selectable list (e.g. rules already referenced in the ChangeSet). */
  excludeIds?: ReadonlySet<string>;
}

/**
 * Searchable picker for existing classification rules. Used by the correction
 * proposal dialog when the user wants to target an existing rule with an
 * edit/disable/remove operation.
 *
 * Paginated list is fetched lazily on popover open to avoid paying for the
 * network round-trip when the dialog is dismissed without adding a targeted op.
 */
function useRulePickerState(props: RulePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const listQuery = trpc.core.corrections.list.useQuery(
    { limit: 200, offset: 0 },
    { enabled: open, staleTime: 30_000 }
  );
  const rules = listQuery.data?.data ?? [];
  const selectedRule = useMemo(
    () => rules.find((r) => r.id === props.value) ?? null,
    [rules, props.value]
  );
  const filteredRules = useMemo(() => {
    const exclude = props.excludeIds;
    const needle = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (exclude?.has(r.id)) return false;
      if (!needle) return true;
      const haystack =
        `${r.descriptionPattern} ${r.entityName ?? ''} ${r.location ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [rules, search, props.excludeIds]);
  const handleSelect = (rule: CorrectionRule) => {
    props.onChange(rule);
    setOpen(false);
    setSearch('');
  };
  return { open, setOpen, search, setSearch, listQuery, selectedRule, filteredRules, handleSelect };
}

export function RulePicker(props: RulePickerProps) {
  const s = useRulePickerState(props);
  return (
    <Popover open={s.open} onOpenChange={s.setOpen}>
      <PopoverTrigger asChild>
        <RulePickerTrigger
          open={s.open}
          disabled={props.disabled}
          selectedRule={s.selectedRule}
          placeholder={props.placeholder}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[360px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search rules by pattern, entity, or location..."
            value={s.search}
            onValueChange={s.setSearch}
          />
          <CommandList>
            <RulePickerList
              isLoading={s.listQuery.isLoading}
              isError={s.listQuery.isError}
              errorMessage={s.listQuery.error?.message}
              filteredRules={s.filteredRules}
              selectedId={props.value}
              onSelect={s.handleSelect}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface RulePickerTriggerProps {
  open: boolean;
  disabled?: boolean;
  selectedRule: CorrectionRule | null;
  placeholder?: string;
}

function RulePickerTrigger({ open, disabled, selectedRule, placeholder }: RulePickerTriggerProps) {
  return (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      className="w-full justify-between font-normal"
    >
      {selectedRule ? (
        <span className="flex items-center gap-2 truncate">
          <code className="truncate rounded bg-muted px-1 py-0.5 text-xs">
            {selectedRule.descriptionPattern}
          </code>
          {selectedRule.entityName && (
            <Badge variant="outline" className="text-xs shrink-0">
              {selectedRule.entityName}
            </Badge>
          )}
          {!selectedRule.isActive && (
            <Badge variant="secondary" className="text-xs shrink-0">
              disabled
            </Badge>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">{placeholder ?? 'Pick an existing rule...'}</span>
      )}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );
}

interface RulePickerListProps {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  filteredRules: CorrectionRule[];
  selectedId: string | null;
  onSelect: (rule: CorrectionRule) => void;
}

function RulePickerList(props: RulePickerListProps) {
  if (props.isLoading) return <CommandEmpty>Loading rules…</CommandEmpty>;
  if (props.isError) return <CommandEmpty>Failed to load rules: {props.errorMessage}</CommandEmpty>;
  if (props.filteredRules.length === 0) return <CommandEmpty>No matching rules.</CommandEmpty>;
  return (
    <CommandGroup>
      {props.filteredRules.map((rule) => (
        <RulePickerItem
          key={rule.id}
          rule={rule}
          isSelected={props.selectedId === rule.id}
          onSelect={() => props.onSelect(rule)}
        />
      ))}
    </CommandGroup>
  );
}

function RulePickerItem({
  rule,
  isSelected,
  onSelect,
}: {
  rule: CorrectionRule;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={rule.id} onSelect={onSelect}>
      <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-2">
          <code className="truncate text-xs font-mono">{rule.descriptionPattern}</code>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {rule.matchType}
          </Badge>
          {!rule.isActive && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              off
            </Badge>
          )}
        </div>
        {(rule.entityName ?? rule.location ?? rule.transactionType) && (
          <div className="text-[11px] text-muted-foreground truncate">
            {[rule.entityName, rule.location, rule.transactionType].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </CommandItem>
  );
}
