import { Zap } from 'lucide-react';

import { Badge, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import type { MatchedRule, ProcessedTransaction } from '@pops/api/modules/finance/imports';

export function HeaderBadges({ transaction }: { transaction: ProcessedTransaction }) {
  const isAutoMatched = transaction.entity?.matchType === ('auto-matched' as never);
  const isEdited = (transaction as ProcessedTransaction & { manuallyEdited?: boolean })
    .manuallyEdited;
  const ruleProvenance = transaction.ruleProvenance;
  const isRuleMatched = Boolean(ruleProvenance) || transaction.entity?.matchType === 'learned';
  const overriddenRules = transaction.matchedRules?.slice(1) ?? [];
  const ruleTitle = ruleProvenance
    ? [
        'Rule matched',
        `Pattern: ${ruleProvenance.pattern}`,
        `Match type: ${ruleProvenance.matchType}`,
        `Confidence: ${Math.round(ruleProvenance.confidence * 100)}%`,
      ].join('\n')
    : 'Rule matched';
  return (
    <>
      {isEdited && (
        <Badge variant="secondary" className="text-xs">
          Edited
        </Badge>
      )}
      {isAutoMatched && (
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Auto-matched
        </Badge>
      )}
      {isRuleMatched && (
        <Badge variant="secondary" className="text-xs" title={ruleTitle}>
          Rule matched
        </Badge>
      )}
      {overriddenRules.length > 0 && <OverriddenRulesPopover rules={overriddenRules} />}
    </>
  );
}

function OverriddenRulesPopover({ rules }: { rules: MatchedRule[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:bg-accent"
          aria-label={`${rules.length} rule${rules.length === 1 ? '' : 's'} overridden`}
        >
          +{rules.length} overridden
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Overridden rules (lower priority)
        </p>
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.ruleId} className="text-xs border rounded p-2 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <code className="font-mono truncate max-w-[18ch]" title={rule.pattern}>
                  {rule.pattern}
                </code>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {rule.matchType}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                Priority: {rule.priority} • {Math.round(rule.confidence * 100)}%
                {rule.entityName && ` • ${rule.entityName}`}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
