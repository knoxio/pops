import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Slider } from './slider';

const meta: Meta<typeof Slider> = {
  title: 'Inputs/Slider',
  component: Slider,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 1,
  },
};

export const Controlled: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState([50]);
    return (
      <div className="space-y-4">
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
        <p className="text-center text-sm text-muted-foreground">Value: {value[0]}</p>
      </div>
    );
  },
};

export const Range: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState([25, 75]);
    return (
      <div className="space-y-4">
        <Slider
          value={value}
          onValueChange={setValue}
          max={100}
          step={1}
          minStepsBetweenThumbs={1}
        />
        <p className="text-center text-sm text-muted-foreground">
          Range: {value[0]} - {value[1]}
        </p>
      </div>
    );
  },
};

export const Steps: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState([25]);
    return (
      <div className="space-y-4">
        <Slider value={value} onValueChange={setValue} max={100} step={25} />
        <p className="text-center text-sm text-muted-foreground">Value: {value[0]} (steps of 25)</p>
      </div>
    );
  },
};

export const BudgetLimit: Story = {
  args: {},
  render: () => {
    const [budget, setBudget] = useState([500]);
    return (
      <div className="space-y-6 w-96">
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Monthly Budget</label>
            <span className="text-sm font-semibold">${budget[0]}</span>
          </div>
          <Slider value={budget} onValueChange={setBudget} min={0} max={2000} step={50} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$0</span>
            <span>$2,000</span>
          </div>
        </div>
      </div>
    );
  },
};

export const PriceRange: Story = {
  args: {},
  render: () => {
    const [range, setRange] = useState([50, 200]);
    return (
      <div className="space-y-6 w-96">
        <div className="space-y-2">
          <label className="text-sm font-medium">Price Range Filter</label>
          <Slider
            value={range}
            onValueChange={setRange}
            min={0}
            max={500}
            step={10}
            minStepsBetweenThumbs={1}
          />
          <div className="flex justify-between text-sm">
            <span className="font-medium">${range[0]}</span>
            <span className="text-muted-foreground">to</span>
            <span className="font-medium">${range[1]}</span>
          </div>
        </div>
      </div>
    );
  },
};

export const MultipleBudgets: Story = {
  args: {},
  render: () => {
    const [food, setFood] = useState([600]);
    const [shopping, setShopping] = useState([400]);
    const [entertainment, setEntertainment] = useState([200]);
    const [transport, setTransport] = useState([300]);

    return (
      <div className="space-y-6 w-96">
        <h3 className="text-lg font-semibold">Set Budget Limits</h3>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Food & Dining</label>
            <span className="text-sm font-semibold">${food[0]}</span>
          </div>
          <Slider value={food} onValueChange={setFood} min={0} max={1000} step={50} />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Shopping</label>
            <span className="text-sm font-semibold">${shopping[0]}</span>
          </div>
          <Slider value={shopping} onValueChange={setShopping} min={0} max={1000} step={50} />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Entertainment</label>
            <span className="text-sm font-semibold">${entertainment[0]}</span>
          </div>
          <Slider
            value={entertainment}
            onValueChange={setEntertainment}
            min={0}
            max={1000}
            step={50}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Transport</label>
            <span className="text-sm font-semibold">${transport[0]}</span>
          </div>
          <Slider value={transport} onValueChange={setTransport} min={0} max={1000} step={50} />
        </div>

        <div className="pt-4 flex justify-between border-t">
          <span className="font-medium">Total Budget</span>
          <span className="font-bold text-lg">
            ${food[0]! + shopping[0]! + entertainment[0]! + transport[0]!}
          </span>
        </div>
      </div>
    );
  },
};

export const DateRange: Story = {
  args: {},
  render: () => {
    const [days, setDays] = useState([7, 30]);

    return (
      <div className="space-y-6 w-96">
        <div className="space-y-2">
          <label className="text-sm font-medium">Transaction History Range</label>
          <Slider
            value={days}
            onValueChange={setDays}
            min={1}
            max={365}
            step={1}
            minStepsBetweenThumbs={1}
          />
          <div className="flex justify-between text-sm">
            <span>{days[0]} days ago</span>
            <span>{days[1]} days ago</span>
          </div>
        </div>
      </div>
    );
  },
};

export const SavingsGoal: Story = {
  args: {},
  render: () => {
    const [monthlyContribution, setMonthlyContribution] = useState([500]);
    const goal = 10000;
    const months = Math.ceil(goal / monthlyContribution[0]!);

    return (
      <div className="space-y-6 w-96 rounded-lg border p-6">
        <div>
          <h3 className="text-lg font-semibold">Savings Goal Calculator</h3>
          <p className="text-sm text-muted-foreground">Goal: ${goal.toLocaleString()}</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Monthly Contribution</label>
            <span className="text-sm font-semibold">${monthlyContribution[0]}</span>
          </div>
          <Slider
            value={monthlyContribution}
            onValueChange={setMonthlyContribution}
            min={50}
            max={2000}
            step={50}
          />
        </div>

        <div className="space-y-2 rounded-lg bg-muted p-4">
          <div className="flex justify-between text-sm">
            <span>Time to reach goal:</span>
            <span className="font-medium">{months} months</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Total contributions:</span>
            <span className="font-medium">
              ${(monthlyContribution[0]! * months).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: [50],
    disabled: true,
  },
};

export const CustomColors: Story = {
  args: {},
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Default (Primary)</p>
        <Slider defaultValue={[50]} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Success (Green)</p>
        <Slider
          defaultValue={[75]}
          className="[&_[data-slot=slider-range]]:bg-green-600 [&_[data-slot=slider-thumb]]:border-green-600"
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Warning (Yellow)</p>
        <Slider
          defaultValue={[85]}
          className="[&_[data-slot=slider-range]]:bg-yellow-600 [&_[data-slot=slider-thumb]]:border-yellow-600"
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Danger (Red)</p>
        <Slider
          defaultValue={[95]}
          className="[&_[data-slot=slider-range]]:bg-red-600 [&_[data-slot=slider-thumb]]:border-red-600"
        />
      </div>
    </div>
  ),
};

export const WithLabels: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState([3]);
    const labels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

    return (
      <div className="space-y-6 w-96">
        <div className="space-y-4">
          <label className="text-sm font-medium">Risk Tolerance</label>
          <Slider value={value} onValueChange={setValue} min={0} max={4} step={1} />
          <div className="flex justify-between text-xs text-muted-foreground">
            {labels.map((label, i) => (
              <span key={i} className={value[0] === i ? 'font-medium text-foreground' : ''}>
                {label}
              </span>
            ))}
          </div>
          <p className="text-center text-sm font-medium">Current: {labels[value[0]!]}</p>
        </div>
      </div>
    );
  },
};
