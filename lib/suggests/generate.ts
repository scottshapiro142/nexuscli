/**
 * Nexus Suggests: ask Iris to propose three apps for the sheet.
 *
 * Single LLM call, returns an array of three full AppSpec objects. Each is
 * Zod-validated individually. The model is asked to vary archetypes — at
 * least one triage if a meaningful predicate exists.
 */

import OpenAI from "openai";
import type { ParsedSheet } from "@/lib/sheets/fetch-csv";
import type { ColumnSummary } from "@/lib/sheets/infer-columns";
import type { StructuralSummary } from "@/lib/sheets/summarize";
import { requireOpenRouterKey } from "@/lib/kernel/config";
import { AppSpecSchema, type AppSpec } from "@/lib/spec/types";
import type { Tell } from "@/lib/tells/types";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export async function generateSuggests(args: {
  sheet: ParsedSheet;
  summary: StructuralSummary;
  columns: ColumnSummary[];
  tells: Tell[];
}): Promise<AppSpec[]> {
  const apiKey = requireOpenRouterKey();

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://nexus.local", "X-Title": "Nexus" },
  });

  const prompt = buildSuggestsPrompt(args);
  const model = process.env.NEXUS_MODEL ?? DEFAULT_MODEL;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 3500,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Iris returned no suggests.");

  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error(`Suggests output not JSON: ${raw.slice(0, 240)}`);
  }
  if (!json || typeof json !== "object" || !("apps" in json) || !Array.isArray((json as { apps: unknown }).apps)) {
    throw new Error(`Suggests output missing 'apps' array.`);
  }

  const apps = (json as { apps: unknown[] }).apps;
  const validFieldNames = new Set(args.columns.map((c) => c.name));
  const out: AppSpec[] = [];
  for (const appRaw of apps) {
    const parsed = AppSpecSchema.safeParse(appRaw);
    if (!parsed.success) continue;
    const used = collectFields(parsed.data);
    if (used.every((f) => validFieldNames.has(f))) {
      out.push(parsed.data);
    }
  }

  if (out.length === 0) throw new Error("Iris's suggests didn't validate against the AppSpec schema.");
  return out.slice(0, 3);
}

function buildSuggestsPrompt(args: {
  sheet: ParsedSheet;
  summary: StructuralSummary;
  columns: ColumnSummary[];
  tells: Tell[];
}): string {
  const { sheet, summary, columns, tells } = args;

  const compactColumns = columns.map((c) => ({
    name: c.name,
    type: c.type,
    unique: c.uniqueCount,
    nonEmpty: c.nonEmptyCount,
    samples: c.sampleValues.slice(0, 4),
    enumValues: c.enumValues,
  }));

  const tellsList = tells.length
    ? tells.map((t, i) => `${i + 1}. ${t.phrase}`).join("\n")
    : "(no specific observations — use a holistic view)";

  return `You are Iris, the Nexus agent. You've just read a sheet. Now propose THREE apps the user would find useful for it.

Sheet:
- Subject: ${summary.subject}
- Description: ${summary.description}
- Total rows: ${sheet.rawRowCount}

Columns (with types and sample values):
${JSON.stringify(compactColumns, null, 2)}

You noticed:
${tellsList}

Propose three apps. Each must be a complete AppSpec.

Choose archetypes for variety:
- "dashboard" — multiple metric tiles plus one chart. Best for overviews.
- "list" — cards of records. Best for browsing.
- "tracker" — one big number plus trend. Best for a single metric.
- "table" — filtered table with filter chips. Best for slicing records.
- "triage" — queue of rows needing attention. Best for action-oriented intents.

Required:
- Three apps total.
- At least two different archetypes across the three.
- If a meaningful "needs attention" predicate exists for this sheet, ONE of the three must be a triage.
- titles should be noun phrases describing the view ("Verdicts by Agent", not "Show me verdicts by agent").
- Every \`field\` value must match exactly one of the column names above.
- Never invent values; use only ones from the column samples.
- Never use em dashes.

Output ONLY a JSON object of this shape, no prose, no code fences:

{
  "apps": [
    { /* AppSpec 1 */ },
    { /* AppSpec 2 */ },
    { /* AppSpec 3 */ }
  ]
}

AppSpec branches (abridged):

  Aggregation =
    | { kind: "count" }
    | { kind: "count_unique"; field }
    | { kind: "count_where"; field; value }
    | { kind: "sum" | "avg" | "min" | "max"; field }
    | { kind: "ratio_where"; field; value }

  Filter =
    | { op: "equals" | "not_equals" | "contains"; field; value: string }
    | { op: "in"; field; values: string[] }
    | { op: "gt" | "lt" | "gte" | "lte" | "year_is"; field; value: number }
    | { op: "month_is"; field; value: "YYYY-MM" }
    | { op: "between"; field; min: number; max: number }
    | { op: "is_empty" | "is_not_empty"; field }

  dashboard: { archetype: "dashboard", title, metrics: [{ label, agg, format? }], chart?: { type: "bar"|"line"|"pie", group_by, series: agg }, filters? }
  list:      { archetype: "list", title, primary_field, secondary_field?, badge_field?, meta_fields?: [], filters?, sort?, limit? }
  tracker:   { archetype: "tracker", title, metric: agg, format?, filters?, trend?: { compare_to } }
  table:     { archetype: "table", title, columns: [string], filter_chips?: [string], filters?, sort? }
  triage:    { archetype: "triage", title, queue_predicate: [Filter] /* ANDed */, priority_sort?, card_primary_field, card_summary_fields: [string], reason_summary? }
`;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function collectFields(spec: AppSpec): string[] {
  const fields: string[] = [];
  const pushAgg = (a: unknown) => {
    if (a && typeof a === "object" && "field" in a && typeof a.field === "string") fields.push(a.field);
  };
  const pushFilter = (f: unknown) => {
    if (f && typeof f === "object" && "field" in f && typeof f.field === "string") fields.push(f.field);
  };
  const pushSort = (s: unknown) => {
    if (s && typeof s === "object" && "field" in s && typeof s.field === "string") fields.push(s.field);
  };

  switch (spec.archetype) {
    case "dashboard":
      spec.metrics.forEach((m) => pushAgg(m.agg));
      spec.filters?.forEach(pushFilter);
      if (spec.chart) {
        fields.push(spec.chart.group_by);
        pushAgg(spec.chart.series);
      }
      break;
    case "list":
      fields.push(spec.primary_field);
      if (spec.secondary_field) fields.push(spec.secondary_field);
      if (spec.badge_field) fields.push(spec.badge_field);
      spec.meta_fields?.forEach((f) => fields.push(f));
      spec.filters?.forEach(pushFilter);
      pushSort(spec.sort);
      break;
    case "tracker":
      pushAgg(spec.metric);
      spec.filters?.forEach(pushFilter);
      break;
    case "table":
      spec.columns.forEach((f) => fields.push(f));
      spec.filter_chips?.forEach((f) => fields.push(f));
      spec.filters?.forEach(pushFilter);
      pushSort(spec.sort);
      break;
    case "triage":
      spec.queue_predicate.forEach(pushFilter);
      fields.push(spec.card_primary_field);
      spec.card_summary_fields.forEach((f) => fields.push(f));
      pushSort(spec.priority_sort);
      break;
  }
  return fields;
}
