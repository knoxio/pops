/**
 * ModelConfigPage — AI model configuration and budget settings.
 *
 * Allows configuring which AI model to use, monthly token budget,
 * and fallback behaviour when budget is exceeded. PRD-053/US-01.
 */
import { SETTINGS_KEYS } from '@pops/types';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Input,
  Label,
  Select,
  Skeleton,
  StatCard,
} from '@pops/ui';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

const SETTING_KEYS = {
  model: SETTINGS_KEYS.AI_MODEL,
  budget: SETTINGS_KEYS.AI_MONTHLY_TOKEN_BUDGET,
  fallback: SETTINGS_KEYS.AI_BUDGET_EXCEEDED_FALLBACK,
} as const;

const SUPPORTED_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (claude-haiku-4-5-20251001)' },
];

const FALLBACK_OPTIONS = [
  { value: 'skip', label: 'Skip AI — do not call the model' },
  { value: 'alert', label: 'Alert only — continue calling the model' },
];

const DEFAULTS = {
  model: 'claude-haiku-4-5-20251001',
  budget: '',
  fallback: 'skip',
};

export function ModelConfigPage() {
  const [model, setModel] = useState(DEFAULTS.model);
  const [budget, setBudget] = useState(DEFAULTS.budget);
  const [fallback, setFallback] = useState(DEFAULTS.fallback);
  const [saving, setSaving] = useState(false);

  // Load existing settings
  const modelSetting = trpc.core.settings.get.useQuery(
    { key: SETTING_KEYS.model },
    { retry: false }
  );
  const budgetSetting = trpc.core.settings.get.useQuery(
    { key: SETTING_KEYS.budget },
    { retry: false }
  );
  const fallbackSetting = trpc.core.settings.get.useQuery(
    { key: SETTING_KEYS.fallback },
    { retry: false }
  );

  // Load AI usage stats for current month comparison
  const { data: stats } = trpc.core.aiUsage.getStats.useQuery();

  const settingsMutation = trpc.core.settings.set.useMutation();

  // Populate form when settings load
  useEffect(() => {
    if (modelSetting.data?.data?.value) setModel(modelSetting.data.data.value);
  }, [modelSetting.data]);

  useEffect(() => {
    if (budgetSetting.data?.data?.value) setBudget(budgetSetting.data.data.value);
  }, [budgetSetting.data]);

  useEffect(() => {
    if (fallbackSetting.data?.data?.value) setFallback(fallbackSetting.data.data.value);
  }, [fallbackSetting.data]);

  const isLoading = modelSetting.isLoading || budgetSetting.isLoading || fallbackSetting.isLoading;

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        settingsMutation.mutateAsync({ key: SETTING_KEYS.model, value: model }),
        settingsMutation.mutateAsync({
          key: SETTING_KEYS.budget,
          value: budget,
        }),
        settingsMutation.mutateAsync({ key: SETTING_KEYS.fallback, value: fallback }),
      ]);
      toast.success('AI configuration saved');
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  // Calculate token usage from last 30 days
  const currentMonthTokens =
    (stats?.last30Days?.inputTokens ?? 0) + (stats?.last30Days?.outputTokens ?? 0);
  const budgetNum = budget ? parseInt(budget, 10) : 0;
  const budgetUsedPct = budgetNum > 0 ? Math.min((currentMonthTokens / budgetNum) * 100, 100) : 0;

  const navigation = (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/ai">AI</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Model Config</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link
          to="/ai"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Back to AI"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Model Configuration</h1>
      </div>

      <p className="text-sm text-muted-foreground">Configure AI model and spending limits</p>
    </>
  );

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        {navigation}
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {navigation}

      {/* Usage vs Budget */}
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          title="Current Month Tokens"
          value={currentMonthTokens.toLocaleString()}
          description="Total token usage"
          color="indigo"
        />
        <StatCard
          title="Monthly Budget"
          value={budgetNum > 0 ? budgetNum.toLocaleString() : 'No limit'}
          description={budgetNum > 0 ? `${budgetUsedPct.toFixed(1)}% used` : 'Set a budget below'}
          color={budgetUsedPct > 90 ? 'rose' : budgetUsedPct > 70 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Budget progress bar */}
      {budgetNum > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Budget usage</span>
            <span>
              {currentMonthTokens.toLocaleString()} / {budgetNum.toLocaleString()} tokens
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budgetUsedPct > 90
                  ? 'bg-destructive'
                  : budgetUsedPct > 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${budgetUsedPct}%` }}
              role="progressbar"
              aria-valuenow={budgetUsedPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Budget usage"
            />
          </div>
        </div>
      )}

      {/* Settings Form */}
      <div className="border rounded-lg p-6 space-y-5">
        <Select
          label="AI Model"
          options={SUPPORTED_MODELS}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />

        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Monthly Token Budget</Label>
          <Input
            type="number"
            placeholder="e.g. 1000000"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            min={0}
          />
        </div>

        <Select
          label="When Budget Exceeded"
          options={FALLBACK_OPTIONS}
          value={fallback}
          onChange={(e) => setFallback(e.target.value)}
        />

        <div className="pt-2">
          <Button onClick={handleSave} loading={saving}>
            Save Configuration
          </Button>
        </div>
      </div>

      {budgetUsedPct >= 100 && (
        <Alert variant="destructive">
          <h3 className="font-semibold">Budget exceeded</h3>
          <p className="text-sm mt-1">
            Current month usage has reached the configured token budget.
            {fallback === 'skip'
              ? ' AI categorisation is currently disabled.'
              : ' AI calls will continue but usage is over budget.'}
          </p>
        </Alert>
      )}
    </div>
  );
}
