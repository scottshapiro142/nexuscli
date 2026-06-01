/**
 * Nexus: generate AppSpec from a sheet + intent.
 *
 * Single LLM call. Strict JSON output, Zod validation, clear errors when the
 * model produces something off-schema (which is then surfaceable to the user).
 */

import OpenAI from "openai";
import type { ParsedSheet } from "../sheets/fetch-csv";
import type { ColumnSummary } from "../sheets/infer-columns";
import type { StructuralSummary } from "../sheets/summarize";
import { requireOpenRouterKey } from "../kernel/config";
import { AppSpecSchema, type AppSpec } from "./types";
import { buildSpecPrompt } from "./prompt";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export async function generateAppSpec(args: {
  sheet: ParsedSheet;
  summary: StructuralSummary;
  columns: ColumnSummary[];
  intent: string;
}): Promise<AppSpec> {
  const apiKey = requireOpenRouterKey();
  if (!args.intent || !args.intent.trim()) {
    throw new Error("Intent is empty.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://nexus.local", "X-Title": "Nexus" },
  });

  const prompt = buildSpecPrompt(args);
  const model = process.env.NEXUS_MODEL ?? DEFAULT_MODEL;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Model returned an empty response.");

  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error(`Model returned non-JSON: ${raw.slice(0, 240)}`);
  }

  // Validate the column names referenced in the spec actually exist in the sheet,
  // in addition to the structural Zod check. This catches the most common LLM error
  // (hallucinating a field name).
  const result = AppSpecSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Model output did not match AppSpec schema: ${JSON.stringify(result.error.issues.slice(0, 5))}`
    );
  }
  const spec = result.data;

  const validFieldNames = new Set(args.columns.map((c) => c.name));
  const usedFields = collectFieldReferences(spec);
  const invalid = usedFields.filter((f) => !validFieldNames.has(f));
  if (invalid.length > 0) {
    throw new Error(`Spec references columns not in the sheet: ${invalid.join(", ")}`);
  }

  return spec;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Walk an AppSpec and collect every field-name reference. Used to verify the
 * model didn't hallucinate a column that isn't in the sheet.
 */
function collectFieldReferences(spec: AppSpec): string[] {
  const fields: string[] = [];

  const pushFromAgg = (agg: unknown) => {
    if (agg && typeof agg === "object" && "field" in agg && typeof agg.field === "string") {
      fields.push(agg.field);
    }
  };
  const pushFromFilter = (f: unknown) => {
    if (f && typeof f === "object" && "field" in f && typeof f.field === "string") {
      fields.push(f.field);
    }
  };
  const pushFromSort = (s: unknown) => {
    if (s && typeof s === "object" && "field" in s && typeof s.field === "string") {
      fields.push(s.field);
    }
  };

  switch (spec.archetype) {
    case "dashboard":
      spec.metrics.forEach((m) => pushFromAgg(m.agg));
      spec.filters?.forEach(pushFromFilter);
      if (spec.chart) {
        fields.push(spec.chart.group_by);
        pushFromAgg(spec.chart.series);
      }
      break;
    case "list":
      fields.push(spec.primary_field);
      if (spec.secondary_field) fields.push(spec.secondary_field);
      if (spec.badge_field) fields.push(spec.badge_field);
      spec.meta_fields?.forEach((f) => fields.push(f));
      spec.filters?.forEach(pushFromFilter);
      pushFromSort(spec.sort);
      break;
    case "tracker":
      pushFromAgg(spec.metric);
      spec.filters?.forEach(pushFromFilter);
      break;
    case "table":
      spec.columns.forEach((f) => fields.push(f));
      spec.filter_chips?.forEach((f) => fields.push(f));
      spec.filters?.forEach(pushFromFilter);
      pushFromSort(spec.sort);
      break;
    case "triage":
      spec.queue_predicate.forEach(pushFromFilter);
      fields.push(spec.card_primary_field);
      spec.card_summary_fields.forEach((f) => fields.push(f));
      pushFromSort(spec.priority_sort);
      break;
  }

  return fields;
}
