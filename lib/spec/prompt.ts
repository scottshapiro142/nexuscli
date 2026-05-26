/**
 * Nexus: AppSpec prompt builder.
 *
 * Pulls together the structural read of the sheet (subject, description,
 * columns) and the user's intent, then asks the model to produce an AppSpec
 * matching one of five archetypes.
 */

import type { ParsedSheet } from "../sheets/fetch-csv";
import type { ColumnSummary } from "../sheets/infer-columns";
import type { StructuralSummary } from "../sheets/summarize";

export function buildSpecPrompt(args: {
  sheet: ParsedSheet;
  summary: StructuralSummary;
  columns: ColumnSummary[];
  intent: string;
}): string {
  const { sheet, summary, columns, intent } = args;

  const compactColumns = columns.map((c) => ({
    name: c.name,
    type: c.type,
    unique: c.uniqueCount,
    nonEmpty: c.nonEmptyCount,
    samples: c.sampleValues.slice(0, 4),
    enumValues: c.enumValues,
  }));

  return `You translate a user's intent about a Google Sheet into a strict app specification (an AppSpec) that a deterministic renderer will turn into UI.

Sheet:
- Subject: ${summary.subject}
- Description: ${summary.description}
- Total rows: ${sheet.rawRowCount}

Columns (with types and sample values):
${JSON.stringify(compactColumns, null, 2)}

First 3 rows of data:
${JSON.stringify(sheet.rows.slice(0, 3), null, 2)}

User intent: "${intent}"

Pick ONE archetype:

1. "dashboard" — multiple metric tiles plus one optional chart. Use for "overview", "summary", "show me X by Y" where the user wants a composite view.

2. "list" — cards of individual records, one per row. Use for "browse", "see all", "show me each", or when the user wants to look at individual items rather than aggregates.

3. "tracker" — ONE big number plus optional trend. Use when the intent is about a single metric: "skip rate", "average X", "how many Y", "what percent Z".

4. "table" — filtered data table with optional filter chips. Use for "filter by", "find rows where", "show me X with Y", when the user wants to slice records.

5. "triage" — queue of records that need attention. Use when the intent involves: "what needs attention", "needs follow up", "incomplete", "missing", "outliers worth reviewing", "stale", "low confidence", "conflicting", "review queue", or any action-oriented signal. Pick this when the user wants to *act* on rows, not just look at them.

Output ONLY a JSON object matching the AppSpec schema. No prose. No code fences.

AppSpec schema (TypeScript-ish, abridged):

  Aggregation =
    | { kind: "count" }
    | { kind: "count_unique"; field }
    | { kind: "count_where"; field; value }    // count of rows where field == value
    | { kind: "sum" | "avg" | "min" | "max"; field }
    | { kind: "ratio_where"; field; value }    // 0..1

  Filter =
    | { op: "equals" | "not_equals" | "contains"; field; value: string }
    | { op: "in"; field; values: string[] }
    | { op: "gt" | "lt" | "gte" | "lte" | "year_is"; field; value: number }
    | { op: "month_is"; field; value: "YYYY-MM" }
    | { op: "between"; field; min: number; max: number }
    | { op: "is_empty" | "is_not_empty"; field }

  Sort = { field; direction: "asc" | "desc" }

  Dashboard:
    { archetype: "dashboard", title, metrics: [{ label, agg, format? }], chart?: { type: "bar"|"line"|"pie", group_by, series: agg }, filters? }

  List:
    { archetype: "list", title, primary_field, secondary_field?, badge_field?, meta_fields?: [], filters?, sort?, limit? }

  Tracker:
    { archetype: "tracker", title, metric: agg, format?: "number"|"integer"|"percent"|"currency", filters?, trend?: { compare_to: "previous_period"|"previous_month"|"previous_week"|"previous_year" } }

  Table:
    { archetype: "table", title, columns: [string], filter_chips?: [string], filters?, sort? }

  Triage:
    { archetype: "triage", title, queue_predicate: [Filter]  // ANDed, queue_predicate: [Filter] // ANDed,
      priority_sort?, card_primary_field, card_summary_fields: [string], reason_summary? }

Rules:
- Every \`field\` value must match exactly one of the column names above.
- Every value you put in a Filter must be plausible for that column — use the sample values you saw.
- Prefer count_where / ratio_where over sum / avg when the target column is text or enum.
- For triage, queue_predicate must be specific to what "needs attention" means in THIS sheet. Look for: boolean flags set to FALSE that indicate work owed, low-confidence enum values, dates that are stale, numeric values below a reasonable threshold, fields that are empty when they should be filled, conflicting status fields.
- Never invent column names.
- Never use em dashes.
- Never produce trailing commas or comments in the JSON.
- Output JSON only.`;
}
