/**
 * DslEditor stories — covers the chip-widget surface added in PRD-120 part D.
 *
 * `apps/pops-storybook/.storybook/main.ts` discovers stories from
 * `packages/*\/src/**\/*.stories.@(...)`, so this file lives next to the
 * component (same convention RecipeRenderer.stories.tsx adopted).
 *
 * Stories intentionally render the editor in a controlled wrapper that
 * doesn't pump value changes back into the editor on each keystroke —
 * the editor is the source of truth for its own document while the
 * story is on screen. 120-F will broaden this with the empty / with-errors
 * / with-proposed-slugs / read-only variants the PRD enumerates.
 */
import { useState } from 'react';

import { DslEditor } from './DslEditor';

import type { Meta, StoryObj } from '@storybook/react-vite';

const SAMPLE = [
  '@recipe(slug="smash-burger", title="Smash Burger", servings=2)',
  '@yield(burger, 2:count)',
  '@ingredient(1, chuck:ground, 300:g)',
  '@ingredient(2, brioche-bun, 2:count)',
  '@ingredient(3, american-cheese, 2:count)',
  '@step("Smash @1 into thin patties on a screaming-hot pan for @time(2:min) per side at @temperature(220:c)")',
  '@step("Melt @3 over each patty, then sandwich in @brioche-bun")',
].join('\n');

function StoryHost({
  initialValue,
  readOnly,
}: {
  initialValue: string;
  readOnly?: boolean;
}): JSX.Element {
  const [value, setValue] = useState(initialValue);
  return (
    <DslEditor
      initialValue={value}
      readOnly={readOnly}
      onChange={(next) => {
        setValue(next);
      }}
    />
  );
}

const meta: Meta<typeof StoryHost> = {
  title: 'Food/DslEditor',
  component: StoryHost,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto my-6 w-[720px] max-w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StoryHost>;

export const SampleRecipe: Story = {
  args: { initialValue: SAMPLE },
};

export const ReadOnly: Story = {
  args: { initialValue: SAMPLE, readOnly: true },
};

export const Empty: Story = {
  args: { initialValue: '' },
};
