/**
 * DslEditor stories — cover the scaffold, the `issues` surface (squiggles
 * + tooltip + gutter), the chip widgets, and the read-only mode.
 *
 * `libs/ui/.storybook/main.ts` discovers stories from
 * `pillars/*\/*\/src/**\/*.stories.@(ts|tsx)`, so this file lives next to
 * the component (same convention `RecipeRenderer.stories.tsx` adopted).
 *
 * Stories use a `StoryHost` wrapper that owns the document via
 * `useState` — editing in the rendered Storybook canvas updates the
 * editor's text in place (the host does NOT pump value back into
 * `initialValue`, only stores it; the editor is the source of truth
 * for its own document while the story is on screen).
 */
import { useState } from 'react';

import { DslEditor } from './DslEditor';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { CompileEditorIssue } from './dsl-editor/issues-types';

const SAMPLE = [
  '@recipe(slug="smash-burger", title="Smash Burger", servings=2)',
  '@yield(burger, 2:count)',
  '@ingredient(1, chuck:ground, 300:g)',
  '@ingredient(2, brioche-bun, 2:count)',
  '@ingredient(3, american-cheese, 2:count)',
  '@step("Smash @1 into thin patties on a screaming-hot pan for @time(2:min) per side at @temperature(220:c)")',
  '@step("Melt @3 over each patty, then sandwich in @brioche-bun")',
].join('\n');

// `chuck:ground` has an unknown prep state (`ground` isn't in the
// curated catalogue) and the brioche-bun line refers to a slug that
// the resolver would auto-propose. The fixtures below mirror that.
const ERROR_ISSUES: CompileEditorIssue[] = [
  {
    severity: 'error',
    code: 'UnresolvedPrepStateSlug',
    message: 'Unknown prep state "ground"',
    // `ground` on line 3 spans cols 22..28 (endCol exclusive).
    loc: { startLine: 3, startCol: 22, endLine: 3, endCol: 28 },
    slug: 'ground',
  },
];

const INFO_ISSUES: CompileEditorIssue[] = [
  {
    severity: 'info',
    code: 'ProposedSlug',
    message: 'Will create new ingredient: brioche-bun',
    // `brioche-bun` on line 4 spans cols 16..27 (endCol exclusive).
    loc: { startLine: 4, startCol: 16, endLine: 4, endCol: 27 },
    slug: 'brioche-bun',
  },
  {
    severity: 'info',
    code: 'ProposedSlug',
    message: 'Will create new ingredient: american-cheese',
    // `american-cheese` on line 5 spans cols 16..31 (endCol exclusive).
    loc: { startLine: 5, startCol: 16, endLine: 5, endCol: 31 },
    slug: 'american-cheese',
  },
];

function StoryHost({
  initialValue,
  readOnly,
  issues,
}: {
  initialValue: string;
  readOnly?: boolean;
  issues?: readonly CompileEditorIssue[];
}): JSX.Element {
  const [value, setValue] = useState(initialValue);
  return (
    <DslEditor
      initialValue={value}
      readOnly={readOnly}
      issues={issues}
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

export const Empty: Story = {
  args: { initialValue: '' },
};

export const WithErrors: Story = {
  args: { initialValue: SAMPLE, issues: ERROR_ISSUES },
};

export const WithProposedSlugs: Story = {
  args: { initialValue: SAMPLE, issues: INFO_ISSUES },
};

export const Mixed: Story = {
  args: { initialValue: SAMPLE, issues: [...ERROR_ISSUES, ...INFO_ISSUES] },
};

export const ReadOnly: Story = {
  args: { initialValue: SAMPLE, readOnly: true, issues: ERROR_ISSUES },
};
