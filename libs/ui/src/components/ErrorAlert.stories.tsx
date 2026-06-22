import { ErrorAlert } from './ErrorAlert';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ErrorAlert> = {
  title: 'Feedback/ErrorAlert',
  component: ErrorAlert,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Failed to load data',
    message: 'The backend API is not responding. Make sure the server is running.',
  },
};

export const WithDetails: Story = {
  args: {
    title: 'Unexpected error',
    message: 'Something went wrong while processing your request.',
    details: 'Error: connect ECONNREFUSED 127.0.0.1:3000\n  at TCPConnectWrap.afterConnect',
  },
};
