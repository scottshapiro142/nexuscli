/**
 * Nexus Tells: insight generator.
 *
 * Iris reads the sheet (summary + column info + a sample of rows) and
 * produces 3-5 non-obvious patterns. The output is insight-level, not stats.
 * Examples we want:
 *   - "Agent A and Agent B agree 67% on Category X but only 22% on Category Y."
 *   - "When reviewer R goes first, final verdict skews toward Skip."
 *   - "Skip rate jumped from 31% in April to 52% in May."
 * Examples we don't want:
 *   - "12 rows have X below 0.7."
 *   - "30% are missing Y."
 *   - "5 rows were added this month."
 *
 * The LLM may include a filter when a clean predicate isolates the rows
 * the insight refers to — useful for click-through. When no clean
 * predicate exists, the insight is text-only.
 */

import type { ParsedSheet } from "@/lib/sheets/fetch-csv";
import type { ColumnSummary } from "@/lib/sheets/infer-columns";
import type { StructuralSummary } from "@/lib/sheets/summarize";
import type { Sampler } from "@/lib/iris/sampler";
import { FilterSchema } from "@/lib/spec/types";
import type { Tell, TellKind } from "./types";
import { z } from "zod";

const MAX_ROW_SAMPLE = 80;

const KindEnum = z.enum([
  "bias",
  "anchor",
  "drift",
  "anomaly",
  "agreement",
  "concentration",
  "correlation",
  "other",
]);

const TellSchema = z.object({
  phrase: z.string().min(1),
  kind: KindEnum,
  predicate: z.array(FilterSchema).optional(),
});

const ResponseSchema = z.object({
  insights: z.array(TellSchema).min(0).max(8),
});

export async function generateTells(
  args: {
    sheet: ParsedSheet;
    columns: ColumnSummary[];
    summary: StructuralSummary;
  },
  sampler: Sampler
): Promise<Tell[]> {
  if (!sampler.canSample) return [];

  const prompt = buildPrompt(args);

  try {
    const raw = await sampler.complete({ prompt, maxTokens: 1800, jsonObject: true });
    if (!raw) return [];

    const parsed = JSON.parse(stripCodeFences(raw)) as unknown;
    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) return [];

    const validFieldNames = new Set(args.columns.map((c) => c.name));
    const out: Tell[] = [];
    for (const item of validated.data.insights) {
      // Drop insights whose filter references a non-existent column.
      if (item.predicate) {
        const bad = item.predicate.some((f) => !validFieldNames.has(f.field));
        if (bad) {
          out.push({ kind: item.kind as TellKind, phrase: item.phrase });
          continue;
        }
      }
      out.push({
        kind: item.kind as TellKind,
        phrase: item.phrase,
        predicate: item.predicate,
      });
    }
    return out.slice(0, 6);
  } catch {
    return [];
  }
}

function buildPrompt(args: {
  sheet: ParsedSheet;
  columns: ColumnSummary[];
  summary: StructuralSummary;
}): string {
  const { sheet, columns, summary } = args;

  const compactColumns = columns.map((c) => ({
    name: c.name,
    type: c.type,
    unique: c.uniqueCount,
    nonEmpty: c.nonEmptyCount,
    samples: c.sampleValues.slice(0, 5),
    enumValues: c.enumValues,
  }));

  // Sample rows: take a uniform slice across the sheet for representativeness.
  const total = sheet.rows.length;
  const sampleSize = Math.min(MAX_ROW_SAMPLE, total);
  const stride = total <= sampleSize ? 1 : Math.floor(total / sampleSize);
  const sampleRows: typeof sheet.rows = [];
  for (let i = 0; i < total && sampleRows.length < sampleSize; i += stride) {
    sampleRows.push(sheet.rows[i]);
  }

  return `You are Iris, a sharp data analyst. You've just been shown a sheet. Point out 3 to 5 NON-OBVIOUS patterns — the kind of thing a human reading this sheet for the first time would react to with "huh, I didn't notice that."

Sheet:
- Subject: ${summary.subject}
- Description: ${summary.description}
- Total rows: ${sheet.rawRowCount}

Columns (types, sample values, enum values where applicable):
${JSON.stringify(compactColumns, null, 2)}

A representative sample of rows (${sampleRows.length} of ${total}):
${JSON.stringify(sampleRows, null, 2)}

Rules:
- Each insight is one or two sentences. Direct. Specific. Names columns and values from the data.
- Examples of insight-level observations we want:
  * "Reviewer X agrees with the panel 78% of the time on Category A, but only 31% on Category B. Reviewer X has a specific bias against B."
  * "When the first review on a submission is Skip, the final verdict is Skip 84% of the time. The first review is anchoring the rest."
  * "Skip rate doubled in the last 30 days versus the prior 60. Something changed."
  * "Three submissions have unanimous Ship votes but average confidence below 0.6. They passed by consensus, not conviction."
- Examples we DON'T want (these are stats, not insights):
  * "12 rows have confidence below 0.7."
  * "30% of rows are missing field X."
  * "5 rows were added this month."
- Never use em dashes.
- If two columns covary, name BOTH and describe the direction.
- Prefer insights that involve MULTIPLE columns over single-column observations.
- Where you cite a number, be specific ("78%" not "most"; "84%" not "the majority"). Numbers should come from the sample you can see.
- Do not moralize or recommend. Observe only.
- If a clean filter would isolate the rows your insight is about, include "predicate" as an array of Filter objects. Otherwise omit it.

Filter shape:
  { op: "equals" | "not_equals" | "contains"; field: string; value: string }
  { op: "in"; field: string; values: string[] }
  { op: "gt" | "lt" | "gte" | "lte" | "year_is"; field: string; value: number }
  { op: "month_is"; field: string; value: "YYYY-MM" }
  { op: "between"; field: string; min: number; max: number }
  { op: "is_empty" | "is_not_empty"; field: string }

Output ONLY a JSON object. No prose, no code fences.

{
  "insights": [
    {
      "phrase": "...",
      "kind": "bias" | "anchor" | "drift" | "anomaly" | "agreement" | "concentration" | "correlation" | "other",
      "predicate": <optional Filter[]>
    },
    ...
  ]
}`;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}
