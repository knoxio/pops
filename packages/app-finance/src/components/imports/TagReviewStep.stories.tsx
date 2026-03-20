/**
 * TagReviewStep stories — step 5 of the import wizard.
 * Uses Storybook decorators to pre-populate the import store with confirmed
 * transaction fixtures so the component renders without a real backend.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { TagReviewStep } from "./TagReviewStep";
import { useImportStore } from "../../store/importStore";
import type { ConfirmedTransaction } from "@pops/finance-api/modules/imports";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTransaction = (
  overrides: Partial<ConfirmedTransaction> & {
    description: string;
    amount: number;
    entityName?: string;
  }
): ConfirmedTransaction => ({
  date: "2026-02-20",
  account: "Amex",
  rawRow: "{}",
  checksum: Math.random().toString(36).slice(2),
  tags: [],
  suggestedTags: [],
  ...overrides,
});

const woolworthsTransactions: ConfirmedTransaction[] = [
  makeTransaction({
    description: "WOOLWORTHS METRO 1234",
    amount: -87.45,
    entityName: "Woolworths",
    entityId: "woolworths-id",
    tags: ["Groceries"],
    suggestedTags: [{ tag: "Groceries", source: "entity" }],
  }),
  makeTransaction({
    description: "WOOLWORTHS ONLINE",
    amount: -120.0,
    entityName: "Woolworths",
    entityId: "woolworths-id",
    tags: ["Groceries", "Online"],
    suggestedTags: [
      { tag: "Groceries", source: "rule", pattern: "woolworths" },
      { tag: "Online", source: "ai" },
    ],
  }),
];

const netflixTransactions: ConfirmedTransaction[] = [
  makeTransaction({
    description: "NETFLIX.COM",
    amount: -22.99,
    entityName: "Netflix",
    entityId: "netflix-id",
    tags: ["Subscriptions"],
    suggestedTags: [{ tag: "Subscriptions", source: "ai" }],
  }),
];

const shellTransactions: ConfirmedTransaction[] = [
  makeTransaction({
    description: "SHELL COLES EXPRESS",
    amount: -75.5,
    entityName: "Shell",
    entityId: "shell-id",
    tags: ["Transport"],
    suggestedTags: [
      { tag: "Transport", source: "rule", pattern: "shell" },
    ],
  }),
  makeTransaction({
    description: "SHELL SERVICE STATION",
    amount: -110.0,
    entityName: "Shell",
    entityId: "shell-id",
    tags: ["Transport"],
    suggestedTags: [{ tag: "Transport", source: "entity" }],
  }),
];

const noTagTransactions: ConfirmedTransaction[] = [
  makeTransaction({
    description: "UNKNOWN MERCHANT XYZ",
    amount: -50.0,
    entityName: "Unknown Merchant",
    tags: [],
    suggestedTags: [],
  }),
];

// ---------------------------------------------------------------------------
// Store seeder decorator
// ---------------------------------------------------------------------------

function StoreSeeder({
  transactions,
  children,
}: {
  transactions: ConfirmedTransaction[];
  children: React.ReactNode;
}) {
  const { setConfirmedTransactions, reset } = useImportStore();

  useEffect(() => {
    useImportStore.setState({ currentStep: 5 });
    setConfirmedTransactions(transactions);
    return () => reset();
  }, []);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof TagReviewStep> = {
  component: TagReviewStep,
  title: "Imports/TagReviewStep",
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story, context) => {
      const transactions =
        (context.parameters.transactions as ConfirmedTransaction[]) ?? [];
      return (
        <StoreSeeder transactions={transactions}>
          <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg border shadow-sm">
            <Story />
          </div>
        </StoreSeeder>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof TagReviewStep>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** All transactions have pre-suggested tags with source attribution */
export const WithSuggestedTags: Story = {
  parameters: {
    transactions: [
      ...woolworthsTransactions,
      ...netflixTransactions,
      ...shellTransactions,
    ],
  },
};

/** Some transactions have tags (with sources), one group has none */
export const Mixed: Story = {
  parameters: {
    transactions: [
      ...woolworthsTransactions,
      ...noTagTransactions,
      ...netflixTransactions,
    ],
  },
};

/** All transactions start with no suggested tags — all groups still expanded */
export const NoSuggestions: Story = {
  parameters: {
    transactions: [
      makeTransaction({
        description: "SOME MERCHANT A",
        amount: -50.0,
        entityName: "Merchant A",
        tags: [],
        suggestedTags: [],
      }),
      makeTransaction({
        description: "SOME MERCHANT B",
        amount: -30.0,
        entityName: "Merchant B",
        tags: [],
        suggestedTags: [],
      }),
    ],
  },
};

/** Empty state when no confirmed transactions exist */
export const Empty: Story = {
  parameters: {
    transactions: [],
  },
};

/** Single transaction — all three sources represented in tags */
export const Single: Story = {
  parameters: {
    transactions: [
      makeTransaction({
        description: "WOOLWORTHS METRO",
        amount: -87.45,
        entityName: "Woolworths",
        entityId: "woolworths-id",
        tags: ["Groceries", "Online", "Weekly Shop"],
        suggestedTags: [
          { tag: "Groceries", source: "entity" },
          { tag: "Online", source: "ai" },
          { tag: "Weekly Shop", source: "rule", pattern: "woolworths" },
        ],
      }),
    ],
  },
};
