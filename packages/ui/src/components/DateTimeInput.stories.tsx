/**
 * DateTime input component stories
 * Demonstrates DateInput, TimeInput, and DateTimeInput
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DateInput, TimeInput, DateTimeInput } from "./DateTimeInput";

// DateInput stories
const dateInputMeta: Meta<typeof DateInput> = {
  component: DateInput,
  title: "Inputs/DateTime",
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "ghost", "underline"],
    },
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    shape: {
      control: "select",
      options: ["default", "pill"],
    },
  },
};

export default dateInputMeta;
type DateInputStory = StoryObj<typeof DateInput>;

const CalendarIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// DateInput stories
export const DateDefault: DateInputStory = {
  args: {},
};

export const DateWithIcon: DateInputStory = {
  args: {
    prefix: <CalendarIcon />,
  },
};

export const DateGhost: DateInputStory = {
  args: {
    variant: "ghost",
    prefix: <CalendarIcon />,
  },
};

export const DateUnderline: DateInputStory = {
  args: {
    variant: "underline",
  },
};

export const DatePill: DateInputStory = {
  args: {
    shape: "pill",
    prefix: <CalendarIcon />,
  },
};

export const DateSmall: DateInputStory = {
  args: {
    size: "sm",
    prefix: <CalendarIcon />,
  },
};

export const DateLarge: DateInputStory = {
  args: {
    size: "lg",
    prefix: <CalendarIcon />,
  },
};

export const DateWithMinMax: DateInputStory = {
  args: {
    min: "2024-01-01",
    max: "2024-12-31",
    prefix: <CalendarIcon />,
  },
};

export const DateControlled: DateInputStory = {
  render: (args) => {
    const [date, setDate] = useState("2024-06-15");
    return (
      <div className="space-y-4">
        <DateInput
          {...args}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          prefix={<CalendarIcon />}
        />
        <p className="text-sm text-muted-foreground">Selected: {date}</p>
      </div>
    );
  },
};

// TimeInput stories
export const TimeDefault: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput />,
};

export const TimeWithIcon: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput prefix={<ClockIcon />} />,
};

export const TimeGhost: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput variant="ghost" prefix={<ClockIcon />} />,
};

export const TimeUnderline: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput variant="underline" />,
};

export const TimePill: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput shape="pill" prefix={<ClockIcon />} />,
};

export const TimeSmall: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput size="sm" prefix={<ClockIcon />} />,
};

export const TimeLarge: StoryObj<typeof TimeInput> = {
  render: () => <TimeInput size="lg" prefix={<ClockIcon />} />,
};

export const TimeControlled: StoryObj<typeof TimeInput> = {
  render: () => {
    const [time, setTime] = useState("14:30");
    return (
      <div className="space-y-4">
        <TimeInput
          value={time}
          onChange={(e) => setTime(e.target.value)}
          prefix={<ClockIcon />}
        />
        <p className="text-sm text-muted-foreground">Selected: {time}</p>
      </div>
    );
  },
};

// DateTimeInput stories
export const DateTimeDefault: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput />,
};

export const DateTimeWithIcon: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput prefix={<CalendarIcon />} />,
};

export const DateTimeGhost: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput variant="ghost" prefix={<CalendarIcon />} />,
};

export const DateTimeUnderline: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput variant="underline" />,
};

export const DateTimePill: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput shape="pill" prefix={<CalendarIcon />} />,
};

export const DateTimeSmall: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput size="sm" prefix={<CalendarIcon />} />,
};

export const DateTimeLarge: StoryObj<typeof DateTimeInput> = {
  render: () => <DateTimeInput size="lg" prefix={<CalendarIcon />} />,
};

export const DateTimeControlled: StoryObj<typeof DateTimeInput> = {
  render: () => {
    const [dateTime, setDateTime] = useState("2024-06-15T14:30");
    return (
      <div className="space-y-4">
        <DateTimeInput
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
          prefix={<CalendarIcon />}
        />
        <p className="text-sm text-muted-foreground">Selected: {dateTime}</p>
      </div>
    );
  },
};

// Real-world examples
export const FormExample: StoryObj = {
  render: () => {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [time, setTime] = useState("");

    return (
      <div className="space-y-4 max-w-md p-6 border border-border rounded-lg">
        <h3 className="text-lg font-semibold">Schedule Event</h3>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Start Date</label>
          <DateInput
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            prefix={<CalendarIcon />}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">End Date</label>
          <DateInput
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            prefix={<CalendarIcon />}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Time</label>
          <TimeInput
            value={time}
            onChange={(e) => setTime(e.target.value)}
            prefix={<ClockIcon />}
          />
        </div>
      </div>
    );
  },
};

export const DateRangeFilter: StoryObj = {
  render: () => {
    const [startDate, setStartDate] = useState("2024-01-01");
    const [endDate, setEndDate] = useState("2024-12-31");

    return (
      <div className="space-y-4 max-w-2xl">
        <h3 className="text-lg font-semibold">Date Range Filter</h3>
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-medium">From</label>
            <DateInput
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              prefix={<CalendarIcon />}
            />
          </div>
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-medium">To</label>
            <DateInput
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              prefix={<CalendarIcon />}
            />
          </div>
        </div>
      </div>
    );
  },
};

export const AppointmentScheduler: StoryObj = {
  render: () => {
    const [dateTime, setDateTime] = useState("");

    return (
      <div className="space-y-4 max-w-md p-6 border border-border rounded-lg">
        <h3 className="text-lg font-semibold">Book Appointment</h3>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Select Date & Time
          </label>
          <DateTimeInput
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            prefix={<CalendarIcon />}
          />
        </div>

        {dateTime && (
          <div className="p-4 bg-muted rounded-md">
            <p className="text-sm font-medium">Appointment Details:</p>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(dateTime).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    );
  },
};

export const TransactionFilter: StoryObj = {
  render: () => {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");

    return (
      <div className="space-y-4 max-w-2xl p-6 border border-border rounded-lg">
        <h3 className="text-lg font-semibold">Filter Transactions</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Start Date</label>
            <DateInput
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              prefix={<CalendarIcon />}
              variant="ghost"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">End Date</label>
            <DateInput
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              prefix={<CalendarIcon />}
              variant="ghost"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Start Time</label>
            <TimeInput
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              prefix={<ClockIcon />}
              variant="ghost"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">End Time</label>
            <TimeInput
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              prefix={<ClockIcon />}
              variant="ghost"
            />
          </div>
        </div>
      </div>
    );
  },
};

// All variants comparison
export const AllDateVariants: StoryObj = {
  render: () => (
    <div className="space-y-4">
      <DateInput prefix={<CalendarIcon />} placeholder="Default" />
      <DateInput
        variant="ghost"
        prefix={<CalendarIcon />}
        placeholder="Ghost"
      />
      <DateInput variant="underline" placeholder="Underline" />
    </div>
  ),
};

export const AllTimeVariants: StoryObj = {
  render: () => (
    <div className="space-y-4">
      <TimeInput prefix={<ClockIcon />} placeholder="Default" />
      <TimeInput variant="ghost" prefix={<ClockIcon />} placeholder="Ghost" />
      <TimeInput variant="underline" placeholder="Underline" />
    </div>
  ),
};

export const AllDateTimeVariants: StoryObj = {
  render: () => (
    <div className="space-y-4">
      <DateTimeInput prefix={<CalendarIcon />} placeholder="Default" />
      <DateTimeInput
        variant="ghost"
        prefix={<CalendarIcon />}
        placeholder="Ghost"
      />
      <DateTimeInput variant="underline" placeholder="Underline" />
    </div>
  ),
};

// States
export const States: StoryObj = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Date States</p>
        <div className="space-y-2">
          <DateInput prefix={<CalendarIcon />} placeholder="Empty" />
          <DateInput prefix={<CalendarIcon />} defaultValue="2024-06-15" />
          <DateInput
            prefix={<CalendarIcon />}
            disabled
            defaultValue="2024-06-15"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Time States</p>
        <div className="space-y-2">
          <TimeInput prefix={<ClockIcon />} placeholder="Empty" />
          <TimeInput prefix={<ClockIcon />} defaultValue="14:30" />
          <TimeInput prefix={<ClockIcon />} disabled defaultValue="14:30" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">DateTime States</p>
        <div className="space-y-2">
          <DateTimeInput prefix={<CalendarIcon />} placeholder="Empty" />
          <DateTimeInput
            prefix={<CalendarIcon />}
            defaultValue="2024-06-15T14:30"
          />
          <DateTimeInput
            prefix={<CalendarIcon />}
            disabled
            defaultValue="2024-06-15T14:30"
          />
        </div>
      </div>
    </div>
  ),
};
