/**
 * MediaCard component stories
 * Demonstrates movie, TV show, long title, and no poster variants
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MediaCard } from "./MediaCard";

const meta: Meta<typeof MediaCard> = {
  component: MediaCard,
  title: "Media/MediaCard",
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  argTypes: {
    type: {
      control: "select",
      options: ["movie", "tv"],
      description: "Media type badge",
    },
    year: {
      control: "text",
      description: "Release year or first air year",
    },
    posterUrl: {
      control: "text",
      description: "Poster image URL",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "180px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MediaCard>;

export const Movie: Story = {
  args: {
    id: 1,
    type: "movie",
    title: "The Shawshank Redemption",
    year: "1994",
    posterUrl: "/media/images/movie/1/poster.jpg",
    onClick: (id, type) => console.log("Navigate:", type, id),
  },
};

export const TvShow: Story = {
  args: {
    id: 2,
    type: "tv",
    title: "Breaking Bad",
    year: "2008",
    posterUrl: "/media/images/tv/81189/poster.jpg",
    onClick: (id, type) => console.log("Navigate:", type, id),
  },
};

export const LongTitle: Story = {
  args: {
    id: 3,
    type: "movie",
    title:
      "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
    year: "1964",
    posterUrl: "/media/images/movie/3/poster.jpg",
    onClick: (id, type) => console.log("Navigate:", type, id),
  },
};

export const NoPoster: Story = {
  args: {
    id: 4,
    type: "tv",
    title: "Upcoming Show",
    year: "2026",
    posterUrl: null,
    onClick: (id, type) => console.log("Navigate:", type, id),
  },
};
