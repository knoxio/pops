import { PhotoGallery, type PhotoItem } from './PhotoGallery';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof PhotoGallery> = {
  title: 'Inventory/PhotoGallery',
  component: PhotoGallery,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_PHOTOS: PhotoItem[] = [
  { id: 1, filePath: 'photo-1.jpg', caption: 'Front view', sortOrder: 0 },
  { id: 2, filePath: 'photo-2.jpg', caption: 'Side view', sortOrder: 1 },
  { id: 3, filePath: 'photo-3.jpg', caption: 'Close-up', sortOrder: 2 },
  { id: 4, filePath: 'photo-4.jpg', caption: null, sortOrder: 3 },
  { id: 5, filePath: 'photo-5.jpg', caption: 'Serial number', sortOrder: 4 },
];

export const Default: Story = {
  args: {
    photos: SAMPLE_PHOTOS,
    baseUrl: 'https://placehold.co/300x300/1a1a1a/white?text=',
  },
};

export const Empty: Story = {
  args: {
    photos: [],
  },
};

export const SinglePhoto: Story = {
  args: {
    photos: [SAMPLE_PHOTOS[0]],
    baseUrl: 'https://placehold.co/300x300/1a1a1a/white?text=',
  },
};

export const WithDelete: Story = {
  args: {
    photos: SAMPLE_PHOTOS.slice(0, 3),
    baseUrl: 'https://placehold.co/300x300/1a1a1a/white?text=',
    onDelete: (id) => {
      console.log('Delete photo:', id);
    },
  },
};
