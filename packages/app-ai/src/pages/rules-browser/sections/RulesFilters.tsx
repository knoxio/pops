import { Button, Select, type SelectOption, TextInput } from '@pops/ui';

const MATCH_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Match Types' },
  { value: 'exact', label: 'Exact' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
];

type RulesFiltersProps = {
  matchType: string;
  minConfidence: string;
  onMatchTypeChange: (value: string) => void;
  onMinConfidenceChange: (value: string) => void;
  onClear: () => void;
};

export function RulesFilters({
  matchType,
  minConfidence,
  onMatchTypeChange,
  onMinConfidenceChange,
  onClear,
}: RulesFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        value={matchType}
        onChange={(e) => {
          onMatchTypeChange(e.target.value);
        }}
        options={MATCH_TYPE_OPTIONS}
        className="w-44"
      />
      <TextInput
        type="number"
        placeholder="Min confidence (0-1)"
        value={minConfidence}
        onChange={(e) => {
          onMinConfidenceChange(e.target.value);
        }}
        className="w-44"
        min={0}
        max={1}
        step={0.1}
      />
      {(matchType || minConfidence) && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
