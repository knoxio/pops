/**
 * App Colour Verification — renders key components under each app colour
 * variant to confirm tokens propagate correctly.
 *
 * Use the Storybook toolbar colour picker to switch between colours,
 * or view the "AllColours" story to see every variant side-by-side.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '../primitives/badge';
import { Progress } from '../primitives/progress';
import { Button } from './Button';

const APP_COLOURS = [
  { className: 'app-emerald', label: 'Finance (Emerald)' },
  { className: 'app-indigo', label: 'Media (Indigo)' },
  { className: 'app-amber', label: 'Inventory (Amber)' },
  { className: 'app-violet', label: 'AI (Violet)' },
  { className: 'app-rose', label: 'Rose' },
  { className: 'app-sky', label: 'Sky' },
] as const;

function AccentShowcase() {
  return (
    <div className="space-y-6">
      {/* Accent background */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Accent Background + Foreground
        </h3>
        <div className="flex items-center gap-3">
          <div className="bg-app-accent text-app-accent-foreground px-4 py-2 rounded-lg font-medium">
            bg-app-accent
          </div>
          <div className="bg-app-accent/10 text-app-accent px-4 py-2 rounded-lg font-medium">
            bg-app-accent/10
          </div>
          <div className="bg-app-accent/20 text-app-accent px-4 py-2 rounded-lg font-medium">
            bg-app-accent/20
          </div>
        </div>
      </section>

      {/* Text colours */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Text Colours
        </h3>
        <div className="flex items-center gap-6">
          <span className="text-app-accent font-medium">text-app-accent</span>
          <span className="text-app-accent/80 font-medium">text-app-accent/80</span>
          <span className="text-app-accent/60 font-medium">text-app-accent/60</span>
        </div>
      </section>

      {/* Borders */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Borders
        </h3>
        <div className="flex items-center gap-3">
          <div className="border-2 border-app-accent px-4 py-2 rounded-lg">border-app-accent</div>
          <div className="border-2 border-app-accent/30 px-4 py-2 rounded-lg">
            border-app-accent/30
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Buttons with Accent
        </h3>
        <div className="flex items-center gap-3">
          <Button className="bg-app-accent hover:bg-app-accent/90 text-app-accent-foreground">
            Primary Action
          </Button>
          <Button variant="outline" className="border-app-accent/30 text-app-accent">
            Outline
          </Button>
          <Button variant="ghost" className="text-app-accent hover:bg-app-accent/10">
            Ghost
          </Button>
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Badges
        </h3>
        <div className="flex items-center gap-3">
          <Badge className="bg-app-accent text-app-accent-foreground">Solid</Badge>
          <Badge className="bg-app-accent/10 text-app-accent border-app-accent/20">Subtle</Badge>
          <Badge variant="outline" className="text-app-accent border-app-accent/30">
            Outline
          </Badge>
        </div>
      </section>

      {/* Progress */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Progress
        </h3>
        <div className="space-y-2 max-w-sm">
          <Progress value={75} className="[&>div]:bg-app-accent" />
          <Progress value={40} className="[&>div]:bg-app-accent/70" />
        </div>
      </section>

      {/* Active indicator (simulating app rail) */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Rail Indicator
        </h3>
        <div className="flex items-center gap-4">
          <div className="relative w-16 flex flex-col items-center gap-2 py-2">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-app-accent" />
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-app-accent text-app-accent-foreground shadow-lg shadow-black/20 text-lg font-semibold">
              A
            </span>
          </div>
          <div className="relative w-16 flex flex-col items-center gap-2 py-2">
            <span className="flex items-center justify-center w-12 h-12 rounded-2xl text-muted-foreground hover:bg-muted text-lg font-semibold">
              B
            </span>
          </div>
        </div>
      </section>

      {/* Shadow */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Accent Shadows
        </h3>
        <div className="flex items-center gap-6">
          <div className="bg-card p-4 rounded-lg shadow-lg shadow-app-accent/20 border">
            shadow-app-accent/20
          </div>
          <div className="bg-card p-4 rounded-lg shadow-lg shadow-app-accent/25 border">
            shadow-app-accent/25
          </div>
        </div>
      </section>
    </div>
  );
}

function AllColoursGrid() {
  return (
    <div className="space-y-8">
      {APP_COLOURS.map(({ className, label }) => (
        <div key={className} className={className}>
          <div
            className="rounded-lg border p-6 space-y-4"
            style={{
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
            }}
          >
            <h2 className="text-lg font-bold text-app-accent">{label}</h2>
            <AccentShowcase />
          </div>
        </div>
      ))}
    </div>
  );
}

const meta: Meta = {
  title: 'Verification/App Colours',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj;

/** Uses the Storybook toolbar colour picker to switch accent. */
export const SingleColour: Story = {
  render: () => <AccentShowcase />,
};

/** All 6 app colour variants rendered side-by-side for comparison. */
export const AllColours: Story = {
  render: () => <AllColoursGrid />,
};

/** Dark mode — switch theme to dark in the toolbar to verify contrast. */
export const DarkMode: Story = {
  render: () => <AccentShowcase />,
  globals: { theme: 'dark' },
};

/** All colours in dark mode for contrast verification. */
export const AllColoursDark: Story = {
  render: () => <AllColoursGrid />,
  globals: { theme: 'dark' },
};
