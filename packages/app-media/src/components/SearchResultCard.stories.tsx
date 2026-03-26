/**
 * SearchResultCard stories — search result card variants for movies and TV shows.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchResultCard } from "./SearchResultCard";

const meta: Meta<typeof SearchResultCard> = {
  component: SearchResultCard,
  title: "Media/SearchResultCard",
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "400px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SearchResultCard>;

export const Movie: Story = {
  args: {
    type: "movie",
    title: "Fight Club",
    year: "1999",
    overview:
      "An insomniac office worker and a devil-may-care soap maker form an underground fight club that evolves into much more.",
    posterUrl: "https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QI4S2t015wi.jpg",
    voteAverage: 8.4,
    genres: ["Drama", "Thriller"],
  },
};

export const TvShow: Story = {
  args: {
    type: "tv",
    title: "Breaking Bad",
    year: "2008",
    overview:
      "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.",
    posterUrl: "https://artworks.thetvdb.com/banners/posters/81189-10.jpg",
    genres: ["Drama", "Crime", "Thriller"],
  },
};

export const LongTitle: Story = {
  args: {
    type: "movie",
    title: "The Lord of the Rings: The Return of the King — Extended Edition Director's Cut",
    year: "2003",
    overview: "Gandalf and Aragorn lead the World of Men against Sauron.",
    voteAverage: 9.0,
    genres: ["Adventure", "Fantasy", "Action"],
  },
};

export const NoPoster: Story = {
  args: {
    type: "tv",
    title: "Unknown Show",
    year: "2024",
    overview: "A show with no poster image available.",
    posterUrl: null,
    genres: ["Mystery"],
  },
};

export const InLibrary: Story = {
  args: {
    type: "movie",
    title: "Fight Club",
    year: "1999",
    posterUrl: "https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QI4S2t015wi.jpg",
    voteAverage: 8.4,
    inLibrary: true,
  },
};

export const Adding: Story = {
  args: {
    type: "movie",
    title: "Fight Club",
    year: "1999",
    posterUrl: "https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QI4S2t015wi.jpg",
    voteAverage: 8.4,
    isAdding: true,
  },
};
