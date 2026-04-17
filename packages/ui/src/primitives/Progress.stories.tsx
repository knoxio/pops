import { useEffect, useState } from 'react';

import { Button } from '../components/Button';
import { Progress } from './progress';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Progress> = {
  title: 'Data Display/Progress',
  component: Progress,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 50,
  },
};

export const Empty: Story = {
  args: {
    value: 0,
  },
};

export const Full: Story = {
  args: {
    value: 100,
  },
};

export const BudgetTracking: Story = {
  args: {},
  render: () => {
    const budgets = [
      { category: 'Food', spent: 450, total: 600, color: 'bg-blue-600' },
      { category: 'Shopping', spent: 680, total: 800, color: 'bg-pink-600' },
      {
        category: 'Entertainment',
        spent: 280,
        total: 200,
        color: 'bg-red-600',
      },
      { category: 'Transport', spent: 120, total: 300, color: 'bg-green-600' },
      { category: 'Bills', spent: 550, total: 600, color: 'bg-purple-600' },
    ];

    return (
      <div className="space-y-6">
        {budgets.map((budget) => {
          const percentage = Math.min((budget.spent / budget.total) * 100, 100);
          const isOverBudget = budget.spent > budget.total;

          return (
            <div key={budget.category} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{budget.category}</span>
                <span className={isOverBudget ? 'text-destructive font-medium' : ''}>
                  ${budget.spent} / ${budget.total}
                </span>
              </div>
              <Progress value={percentage} className={isOverBudget ? 'bg-red-200' : ''} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{percentage.toFixed(0)}% spent</span>
                {isOverBudget && (
                  <span className="text-destructive font-medium">
                    ${budget.spent - budget.total} over budget
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
};

export const Animated: Story = {
  args: {},
  render: () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 0;
          return prev + 1;
        });
      }, 50);

      return () => clearInterval(timer);
    }, []);

    return (
      <div className="space-y-4">
        <Progress value={progress} />
        <p className="text-center text-sm text-muted-foreground">{progress}% complete</p>
      </div>
    );
  },
};

export const ControlledProgress: Story = {
  args: {},
  render: () => {
    const [progress, setProgress] = useState(33);

    return (
      <div className="space-y-4">
        <Progress value={progress} />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProgress(Math.max(0, progress - 10))}
          >
            -10%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProgress(Math.min(100, progress + 10))}
          >
            +10%
          </Button>
          <Button variant="outline" size="sm" onClick={() => setProgress(0)}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => setProgress(100)}>
            Complete
          </Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">{progress}%</p>
      </div>
    );
  },
};

export const Sizes: Story = {
  args: {},
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Small (h-1)</p>
        <Progress value={66} className="h-1" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Default (h-2)</p>
        <Progress value={66} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Medium (h-3)</p>
        <Progress value={66} className="h-3" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Large (h-4)</p>
        <Progress value={66} className="h-4" />
      </div>
    </div>
  ),
};

export const ColorVariants: Story = {
  args: {},
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Success (Green)</p>
        <Progress value={75} className="[&>div]:bg-green-600" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Warning (Yellow)</p>
        <Progress value={85} className="[&>div]:bg-yellow-600" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Danger (Red)</p>
        <Progress value={95} className="[&>div]:bg-red-600" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Info (Blue)</p>
        <Progress value={60} className="[&>div]:bg-blue-600" />
      </div>
    </div>
  ),
};

export const SavingsGoal: Story = {
  args: {},
  render: () => {
    const goal = 10000;
    const saved = 6750;
    const percentage = (saved / goal) * 100;

    return (
      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Emergency Fund</h3>
          <span className="text-2xl font-bold">${saved.toLocaleString()}</span>
        </div>
        <Progress value={percentage} className="h-3" />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{percentage.toFixed(1)}% of goal</span>
          <span className="font-medium">Goal: ${goal.toLocaleString()}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          ${(goal - saved).toLocaleString()} remaining
        </p>
      </div>
    );
  },
};

export const MultipleGoals: Story = {
  args: {},
  render: () => {
    const goals = [
      {
        name: 'Emergency Fund',
        current: 6750,
        target: 10000,
        color: 'bg-blue-600',
      },
      { name: 'Vacation', current: 2400, target: 5000, color: 'bg-green-600' },
      { name: 'New Car', current: 8200, target: 15000, color: 'bg-purple-600' },
      {
        name: 'Home Deposit',
        current: 45000,
        target: 80000,
        color: 'bg-orange-600',
      },
    ];

    return (
      <div className="space-y-4">
        {goals.map((goal) => {
          const percentage = (goal.current / goal.target) * 100;
          return (
            <div key={goal.name} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{goal.name}</span>
                <span className="text-muted-foreground">
                  ${goal.current.toLocaleString()} / ${goal.target.toLocaleString()}
                </span>
              </div>
              <Progress value={percentage} className={`[&>div]:${goal.color}`} />
            </div>
          );
        })}
      </div>
    );
  },
};

export const LoadingStates: Story = {
  args: {},
  render: () => {
    const [step, setStep] = useState(0);
    const steps = ['Connecting', 'Syncing', 'Processing', 'Complete'];

    useEffect(() => {
      const timer = setInterval(() => {
        setStep((prev) => {
          if (prev >= steps.length - 1) {
            clearInterval(timer);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);

      return () => clearInterval(timer);
    }, []);

    const progress = ((step + 1) / steps.length) * 100;

    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-lg font-medium">{steps[step]}...</p>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {steps.length}
          </p>
        </div>
        <Progress value={progress} />
      </div>
    );
  },
};
