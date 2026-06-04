/**
 * Nexus: Structural summary.
 *
 * Given a parsed sheet and its inferred columns, ask the model to describe what
 * the sheet appears to be and what work it suggests.
 *
 * Backend-agnostic: the caller passes a Sampler. Today there are three —
 * openrouter, claude-code (shells out to `claude -p`), and local (no-op).
 * Callers should check `sampler.canSample` before calling this; we don't
 * silently no-op here because an empty summary downstream would be confusing.
 */

import type { ParsedSheet } from "./fetch-csv";
import type { ColumnSummary } from "./infer-columns";
import type { Sampler } from "@/lib/iris/sampler";

export type StructuralSummary = {
  description: string;
  subject: string;
  suggestedIntents: string[];
};

export async function generateStructuralSummary(
  sheet: ParsedSheet,
  columns: ColumnSummary[],
  sampler: Sampler
): Promise<StructuralSummary> {
  if (!sampler.canSample) {
    throw new Error(
      "generateStructuralSummary called with a non-sampling backend. Guard with sampler.canSample at the caller."
    );
  }

  const compactColumns = columns.map((c) => ({
    name: c.name,
    type: c.type,
    unique: c.uniqueCount,
    nonEmpty: c.nonEmptyCount,
    samples: c.sampleValues,
    enumValues: c.enumValues,
  }));

  const prompt = `You are looking at a Google Sheet a user has connected to Nexus. Nexus turns sheets into apps. Your job is to describe what this sheet is and suggest what kind of app a user might want to build from it.

Sheet structure:
- ${sheet.headers.length} columns
- ${sheet.rawRowCount} data rows

Columns (with inferred types and samples):
${JSON.stringify(compactColumns, null, 2)}

First 3 rows of data:
${JSON.stringify(sheet.rows.slice(0, 3), null, 2)}

Respond with ONLY a JSON object, no prose, no code fences, matching this shape:

{
  "subject": "<3-6 words describing what this sheet tracks>",
  "description": "<one paragraph, 2-4 sentences, describing what the sheet is and what someone working with it would care about. Plain language, no bullet points, no em dashes.>",
  "suggestedIntents": [
    "<a short verb-led phrase a user might type to build an app from this sheet>",
    "<another>",
    "<another>"
  ]
}

Rules:
- Three suggestedIntents, each 2-6 words, each a different angle (overview, filter/segment, tracker/alert).
- Be specific to this sheet's actual columns and data, not generic.
- Never use em dashes.`;

  const text = await sampler.complete({ prompt, maxTokens: 800, jsonObject: true });
  if (!text) {
    throw new Error("Model returned an empty response.");
  }

  const cleaned = stripCodeFences(text);
  let parsed: StructuralSummary;
  try {
    parsed = JSON.parse(cleaned) as StructuralSummary;
  } catch {
    throw new Error(`Model returned non-JSON summary: ${text.slice(0, 200)}`);
  }

  parsed.subject = (parsed.subject ?? "").trim();
  parsed.description = (parsed.description ?? "").trim();
  parsed.suggestedIntents = (parsed.suggestedIntents ?? []).map((s) => s.trim()).filter(Boolean);

  return parsed;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}
