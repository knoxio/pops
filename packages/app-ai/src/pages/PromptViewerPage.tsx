/**
 * PromptViewerPage — read-only display of AI prompt templates.
 *
 * Shows the current prompt templates used for transaction categorisation
 * and rule generation, with model attribution. PRD-053/US-04.
 */
import { PageHeader } from "@pops/ui";

const PROMPTS = [
  {
    title: "Transaction Categorisation",
    model: "claude-haiku-4-5-20251001",
    description:
      "Used when a bank transaction cannot be matched to a known entity. Extracts merchant name and spending category from the raw transaction description.",
    template: `Given this bank transaction data, identify the merchant/entity name and a spending category.

Transaction data: {rawRow}

Reply in JSON only: {"entityName": "...", "category": "..."}
Common categories: Groceries, Dining, Transport, Utilities, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Government, Education, Travel, Rent, Other.`,
  },
  {
    title: "Rule Generation",
    model: "claude-haiku-4-5-20251001",
    description:
      "Proposes reusable tagging rules from a batch of transactions. Rules are stored and applied automatically to future imports.",
    template: `You are a transaction categorization assistant. Given these bank transactions, propose reusable tagging rules that could apply to similar transactions in the future.

Available tags: {tagList}

Transactions:
{transactionLines}

Return a JSON array of proposed rules. Each rule should:
- Have a short description_pattern (the key merchant/description fragment to match)
- Specify match_type: "exact" (full normalized match), "contains" (pattern appears in description), or "regex"
- List relevant tags from the available tags list
- Include brief reasoning

Format:
[{"descriptionPattern":"...","matchType":"exact|contains|regex","tags":["Tag1","Tag2"],"reasoning":"..."}]

Return ONLY the JSON array, no markdown, no explanation.`,
  },
];

export function PromptViewerPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Prompt Templates"
        description="Read-only view of the AI prompt templates used in this application. Prompts are defined in code and cannot be edited here."
      />

      <div className="space-y-8">
        {PROMPTS.map((prompt) => (
          <div key={prompt.title} className="border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b">
              <h2 className="font-semibold">{prompt.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{prompt.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-medium text-muted-foreground">Model:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                  {prompt.model}
                </code>
              </div>
            </div>
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap bg-muted/10 overflow-x-auto">
              {prompt.template}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
