import { HeroImageUploader } from './HeroImageUploader';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof HeroImageUploader> = {
  title: 'Food/HeroImageUploader',
  component: HeroImageUploader,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    recipeId: 1,
    currentPath: null,
    onUploaded: (path) => console.log('uploaded', path),
    onRemoved: () => console.log('removed'),
  },
};

export const WithCurrentHero: Story = {
  args: {
    recipeId: 1,
    currentPath: '1/hero.jpg',
    onUploaded: (path) => console.log('uploaded', path),
    onRemoved: () => console.log('removed'),
  },
};
