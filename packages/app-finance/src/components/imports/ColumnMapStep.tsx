import { useState, useCallback, useMemo, useEffect } from "react";
import crypto from "crypto-js";
import { useImportStore } from "../../store/importStore";
import { Button } from "@pops/ui";
import { AlertCircle, CheckCircle } from "lucide-react";
import type { ParsedTransaction } from "@pops/api/modules/finance/imports";

/**
 * Step 2: Map CSV columns to schema fields and validate parsing
 */
export function ColumnMapStep() {
  const { headers, rows, columnMap, setColumnMap, setParsedTransactions, nextStep, prevStep } =
    useImportStore();

  const [localColumnMap, setLocalColumnMap] = useState(columnMap);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Auto-detect common column names on mount
  useEffect(() => {
    const detected = autoDetectColumns(headers);
    setLocalColumnMap(detected);
    setColumnMap(detected);
  }, [headers, setColumnMap]);

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  const handleColumnChange = useCallback(
    (field: keyof typeof localColumnMap, value: string) => {
      const updated = { ...localColumnMap, [field]: value };
      setLocalColumnMap(updated);
      setColumnMap(updated);
    },
    [localColumnMap, setColumnMap]
  );

  const validateAllRows = useCallback((): {
    valid: boolean;
    errors: string[];
    parsedTransactions: ParsedTransaction[];
  } => {
    const errors: string[] = [];
    const parsedTransactions: ParsedTransaction[] = [];

    if (!localColumnMap.date || !localColumnMap.description || !localColumnMap.amount) {
      errors.push("Please map all required fields: Date, Description, Amount");
      return { valid: false, errors, parsedTransactions };
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const rowNum = i + 2; // +1 for header, +1 for human-readable

      // Validate date
      const dateStr = row[localColumnMap.date];
      const parsedDate = parseDate(dateStr);
      if (!parsedDate) {
        errors.push(`Row ${rowNum}: Invalid date format "${dateStr}"`);
        continue;
      }

      // Validate amount
      const amountStr = row[localColumnMap.amount];
      const parsedAmount = parseAmount(amountStr);
      if (parsedAmount === null) {
        errors.push(`Row ${rowNum}: Invalid amount "${amountStr}"`);
        continue;
      }

      // Valid row - create ParsedTransaction
      const description = row[localColumnMap.description] ?? "";
      const location = localColumnMap.location ? row[localColumnMap.location] : undefined;
      const rawRow = JSON.stringify(row);
      const checksum = crypto.SHA256(rawRow).toString();

      parsedTransactions.push({
        date: parsedDate,
        description,
        amount: parsedAmount,
        account: "Amex",
        location: location ? extractLocation(location) : undefined,
        online: detectOnline(description),
        rawRow,
        checksum,
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.slice(0, 10), // Show first 10 errors
      parsedTransactions,
    };
  }, [rows, localColumnMap]);

  const handleNext = useCallback(() => {
    setIsValidating(true);
    setValidationErrors([]);

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const validation = validateAllRows();

      if (!validation.valid) {
        setValidationErrors(validation.errors);
        setIsValidating(false);
        return;
      }

      // Store parsed transactions for next step
      setParsedTransactions(validation.parsedTransactions);
      setIsValidating(false);
      nextStep();
    }, 100);
  }, [validateAllRows, setParsedTransactions, nextStep]);

  const columnMapFields = [
    { key: "date" as const, label: "Date", required: true },
    { key: "description" as const, label: "Description", required: true },
    { key: "amount" as const, label: "Amount", required: true },
    {
      key: "location" as const,
      label: "Location (Town/City)",
      required: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Map Columns</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Map CSV columns to transaction fields. Showing first 10 rows.
        </p>
      </div>

      <div className="space-y-4">
        {columnMapFields.map((field) => {
          const isInvalid = field.required && !localColumnMap[field.key];
          return (
            <div key={field.key} className="flex items-center gap-4">
              <label className="w-40 text-sm font-medium">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                name={field.key}
                value={localColumnMap[field.key] ?? ""}
                onChange={(e) => handleColumnChange(field.key, e.target.value)}
                aria-invalid={isInvalid}
                className="flex-1 px-3 py-2 border rounded-md"
              >
                <option value="">Select column...</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Preview table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
                <th className="px-4 py-2 text-left font-medium">Amount</th>
                {localColumnMap.location && (
                  <th className="px-4 py-2 text-left font-medium">Location</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {previewRows.map((row, idx) => {
                const dateStr = row[localColumnMap.date ?? ""];
                const amountStr = row[localColumnMap.amount ?? ""];
                const parsedDate = parseDate(dateStr);
                const parsedAmount = parseAmount(amountStr);

                return (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {parsedDate ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={parsedDate ? "" : "text-red-600"}>{dateStr}</span>
                        {parsedDate && (
                          <span className="text-xs text-gray-500">→ {parsedDate}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">{row[localColumnMap.description ?? ""]}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {parsedAmount !== null ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={parsedAmount !== null ? "" : "text-red-600"}>
                          {amountStr}
                        </span>
                        {parsedAmount !== null && (
                          <span className="text-xs text-gray-500">→ {parsedAmount}</span>
                        )}
                      </div>
                    </td>
                    {localColumnMap.location && (
                      <td className="px-4 py-2">{row[localColumnMap.location]}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-2">
            Validation Errors ({validationErrors.length})
          </h3>
          <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
            {validationErrors.map((error, idx) => (
              <li key={idx}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={
            isValidating ||
            !localColumnMap.date ||
            !localColumnMap.description ||
            !localColumnMap.amount
          }
        >
          {isValidating ? "Processing..." : "Next"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Auto-detect common column names
 */
function autoDetectColumns(headers: string[]): {
  date: string;
  description: string;
  amount: string;
  location?: string;
} {
  const datePatterns = ["date", "transaction date", "posting date"];
  const descriptionPatterns = ["description", "merchant", "payee"];
  const amountPatterns = ["amount", "debit", "credit", "value"];
  const locationPatterns = ["town", "city", "town/city", "location"];

  const findMatch = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const match = headers.find((h) => h.toLowerCase().includes(pattern));
      if (match) return match;
    }
    return "";
  };

  return {
    date: findMatch(datePatterns),
    description: findMatch(descriptionPatterns),
    amount: findMatch(amountPatterns),
    location: findMatch(locationPatterns) || undefined,
  };
}

/**
 * Parse date from DD/MM/YYYY to YYYY-MM-DD
 */
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;

  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;
  if (!day || !month || !year) return null;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Parse amount - Amex amounts are positive for charges
 */
function parseAmount(amountStr: string | undefined): number | null {
  if (!amountStr) return null;

  const cleaned = amountStr.replace(/[^0-9.-]/g, "");
  const amount = parseFloat(cleaned);

  if (isNaN(amount)) return null;

  // Invert for Notion format (negative = expense)
  return -amount;
}

/**
 * Extract location from multiline Town/City field
 */
function extractLocation(townCity: string): string | undefined {
  if (!townCity) return undefined;

  const lines = townCity.split("\n");
  const town = lines[0]?.trim();

  if (!town) return undefined;

  return town
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Detect if transaction is online
 */
function detectOnline(description: string): boolean {
  const upper = description.toUpperCase();
  const indicators = [
    "HELP.UBER.COM",
    "PAYPAL",
    "AMAZON",
    "NETFLIX",
    "SPOTIFY",
    "APPLE.COM",
    ".COM.AU",
    ".CO.UK",
  ];
  return indicators.some((indicator) => upper.includes(indicator));
}
